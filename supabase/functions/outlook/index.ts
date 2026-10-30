// Personal Outlook mailbox via Microsoft Graph. Tokens live in
// mail_accounts (no client RLS policies), and every action is scoped to
// the caller's own row — nobody can read another person's mailbox.
// Env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT (default "common"), APP_URL.
import { admin, callerId } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";

const TENANT = Deno.env.get("MS_TENANT") ?? "common";
const CLIENT_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const REDIRECT = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outlook/callback`;
const SCOPES = "offline_access User.Read Mail.Read Mail.Send";
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: SECRET, redirect_uri: REDIRECT, scope: SCOPES, ...params }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as { access_token: string; refresh_token: string; expires_in: number };
}

async function accessToken(uid: string) {
  const { data } = await admin.from("mail_accounts").select("*").eq("user_id", uid).maybeSingle();
  if (!data?.refresh_token) return null;
  if (data.access_token && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token as string;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await admin.from("mail_accounts").update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? data.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("user_id", uid);
  return t.access_token;
}

const graph = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const url = new URL(req.url);

  // OAuth redirect from Microsoft (no Supabase session; matched by state)
  if (url.pathname.endsWith("/callback")) {
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    const { data: row } = await admin.from("mail_accounts").select("user_id").eq("oauth_state", state).maybeSingle();
    if (!row || !state || !code) return Response.redirect(`${APP_URL}/mail?error=oauth`, 302);
    const t = await tokenRequest({ grant_type: "authorization_code", code });
    const me = await (await graph(t.access_token, "/me")).json();
    await admin.from("mail_accounts").update({
      email: me.mail ?? me.userPrincipalName, access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), oauth_state: null,
    }).eq("user_id", row.user_id);
    return Response.redirect(`${APP_URL}/mail?connected=1`, 302);
  }

  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { action, ...p } = await req.json();

  if (action === "connect") {
    const state = crypto.randomUUID();
    await admin.from("mail_accounts").upsert({ user_id: uid, oauth_state: state });
    const auth = new URL(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
    Object.entries({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT, scope: SCOPES, state, prompt: "select_account" })
      .forEach(([k, v]) => auth.searchParams.set(k, v));
    return json({ url: auth.toString() });
  }
  if (action === "disconnect") {
    await admin.from("mail_accounts").delete().eq("user_id", uid);
    return json({ ok: true });
  }

  const token = await accessToken(uid);
  if (action === "status") {
    const { data } = await admin.from("mail_accounts").select("email").eq("user_id", uid).maybeSingle();
    return json({ connected: !!token, email: data?.email ?? null });
  }
  if (!token) return json({ error: "not_connected" }, 400);

  if (action === "list") {
    const folder = p.folder === "sent" ? "sentitems" : "inbox";
    const r = await graph(token, `/me/mailFolders/${folder}/messages?$top=${Math.min(p.top ?? 25, 50)}&$select=id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview&$orderby=receivedDateTime desc`);
    return json(await r.json(), r.status);
  }
  if (action === "read") {
    const id = encodeURIComponent(String(p.id));
    const r = await graph(token, `/me/messages/${id}?$select=id,subject,from,toRecipients,receivedDateTime,body`);
    await graph(token, `/me/messages/${id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });
    return json(await r.json(), r.status);
  }
  if (action === "send") {
    const r = await graph(token, "/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: p.subject, body: { contentType: "HTML", content: p.html ?? "" },
          toRecipients: String(p.to).split(/[,;]\s*/).filter(Boolean).map((a) => ({ emailAddress: { address: a } })),
          attachments: (p.attachments ?? []).map((a: { name: string; mime: string; base64: string }) => ({
            "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.mime, contentBytes: a.base64,
          })),
        },
      }),
    });
    return r.ok ? json({ ok: true }) : json({ error: await r.text() }, r.status);
  }
  return json({ error: "unknown_action" }, 400);
});
