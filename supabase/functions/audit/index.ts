// Sign-in / sign-out audit. IP and location are taken on the server from
// the request, never from the browser. Also reports whether the account's
// access rules (hours / IP / device) currently allow it in.
import { admin, asCaller, callerId } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { event, device_id } = await req.json();
  if (!["sign_in", "sign_out", "idle_sign_out"].includes(event)) return json({ error: "bad_event" }, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  let country: string | null = req.headers.get("cf-ipcountry");
  let city: string | null = null;
  if (ip) {
    try {
      const g = await (await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(2500) })).json();
      if (g.success) { country = g.country ?? country; city = g.city ?? null; }
    } catch { /* geo lookup is best effort */ }
  }

  const { data: allowed } = await asCaller(req).rpc("check_access");
  await admin.from("auth_events").insert({
    user_id: uid, event: allowed === false && event === "sign_in" ? "blocked" : event,
    ip, country, city, user_agent: req.headers.get("user-agent"), device_id: device_id ?? null,
  });
  return json({ allowed: allowed !== false });
});
