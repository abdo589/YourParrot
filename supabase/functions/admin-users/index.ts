// Account management for admins (accounts:write) and the developer.
import { admin, callerCan } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!(await callerCan(req, "accounts", true))) return json({ error: "forbidden" }, 403);
  const isDev = await callerCan(req, "dev", true);
  const { action, ...p } = await req.json();

  if (action === "list") {
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const { data: profiles } = await admin.from("profiles").select("*").order("username");
    const byId = new Map(users.map((u) => [u.id, u]));
    return json(profiles!.map((pr) => ({
      ...pr, last_sign_in_at: byId.get(pr.id)?.last_sign_in_at ?? null,
      email_confirmed: !!byId.get(pr.id)?.email_confirmed_at,
    })));
  }

  if (action === "create") {
    if (p.role === "developer" && !isDev) return json({ error: "developer_only" }, 403);
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email, password: p.password, email_confirm: true,
      user_metadata: { username: p.username, full_name: p.full_name },
    });
    if (error) return json({ error: error.message }, 400);
    const { error: e2 } = await admin.from("profiles").update({
      username: String(p.username).toLowerCase(), full_name: p.full_name, full_name_en: p.full_name_en ?? null,
      role: p.role ?? "viewer", self_signup: false,
    }).eq("id", data.user.id);
    return e2 ? json({ error: e2.message }, 400) : json({ id: data.user.id });
  }

  if (action === "set_password") {
    const { error } = await admin.auth.admin.updateUserById(p.user_id, { password: p.password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (action === "update") {
    const allowed = ["full_name", "full_name_en", "role", "can_approve_leaves", "is_ceo", "is_supervisor",
      "is_meeting_responsible", "employee_id", "username"];
    if (isDev) allowed.push("can_multi_account", "suspended");
    if (p.patch?.role === "developer" && !isDev) return json({ error: "developer_only" }, 403);
    const patch = Object.fromEntries(Object.entries(p.patch ?? {}).filter(([k]) => allowed.includes(k)));
    const { error } = await admin.from("profiles").update(patch).eq("id", p.user_id);
    if (!error && "modules" in p) {
      await admin.from("user_permissions").delete().eq("user_id", p.user_id);
      if (Array.isArray(p.modules) && p.modules.length) {
        await admin.from("user_permissions").insert(p.modules.map((m: { module: string; can_write: boolean }) => ({ user_id: p.user_id, ...m })));
      }
    }
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (action === "ban" && isDev) {
    const { error } = await admin.auth.admin.updateUserById(p.user_id, { ban_duration: p.ban ? "876000h" : "none" });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
});
