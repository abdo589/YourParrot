// Phone check-in. Either a secret per-employee link (no account) or the
// signed-in user's own "My check-in". Selfie + location; the distance to
// the office is recorded, never enforced. Duplicate guard is a unique index.
import { admin, callerId } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

function distance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

async function resolveEmployee(req: Request, token?: string) {
  if (token) {
    const { data } = await admin.from("employees").select("id, full_name, full_name_en, email, status")
      .eq("checkin_token", token).maybeSingle();
    return { emp: data, source: "phone" as const };
  }
  const uid = await callerId(req);
  if (!uid) return { emp: null, source: "self" as const };
  const { data: prof } = await admin.from("profiles").select("employee_id, suspended").eq("id", uid).single();
  if (!prof?.employee_id || prof.suspended) return { emp: null, source: "self" as const };
  const { data } = await admin.from("employees").select("id, full_name, full_name_en, email, status")
    .eq("id", prof.employee_id).single();
  return { emp: data, source: "self" as const, uid };
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const url = new URL(req.url);

  if (req.method === "GET") {
    const { emp } = await resolveEmployee(req, url.searchParams.get("token") ?? undefined);
    if (!emp || emp.status !== "active") return json({ error: "invalid_link" }, 404);
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const { data: punches } = await admin.from("attendance_logs").select("punch_type, punched_at, source")
      .eq("employee_id", emp.id).eq("work_date", today).order("punched_at");
    return json({ name: emp.full_name, name_en: emp.full_name_en, today: punches ?? [] });
  }

  const body = await req.json();
  const { emp, source } = await resolveEmployee(req, body.token);
  if (!emp || emp.status !== "active") return json({ error: "invalid_link" }, 404);
  if (!["in", "out"].includes(body.punch_type)) return json({ error: "bad_type" }, 400);
  if (typeof body.selfie !== "string" || !body.selfie.startsWith("data:image/")) return json({ error: "selfie_required" }, 400);

  const { data: office } = await admin.from("app_settings").select("value").eq("key", "office_location").single();
  const lat = Number(body.lat), lng = Number(body.lng);
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const distance_m = hasLoc ? Math.round(distance(lat, lng, office!.value.lat, office!.value.lng)) : null;

  const [meta, b64] = body.selfie.split(",");
  const mime = meta.slice(5, meta.indexOf(";"));
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) return json({ error: "selfie_too_large" }, 413);
  const path = `${emp.id}/${new Date().toISOString().replace(/[:.]/g, "-")}-${body.punch_type}.${mime.split("/")[1] ?? "jpg"}`;
  const up = await admin.storage.from("selfies").upload(path, bytes, { contentType: mime });
  if (up.error) return json({ error: up.error.message }, 500);

  const { error } = await admin.from("attendance_logs").insert({
    employee_id: emp.id, punch_type: body.punch_type, source,
    lat: hasLoc ? lat : null, lng: hasLoc ? lng : null, distance_m, selfie_path: path,
  });
  if (error) {
    await admin.storage.from("selfies").remove([path]);
    if (error.code === "23505") return json({ error: "duplicate" }, 409);
    return json({ error: error.message }, 500);
  }

  let emailed = false;
  if (emp.email) {
    const { data: signed } = await admin.storage.from("selfies").createSignedUrl(path, 7 * 24 * 3600);
    try {
      await sendEmail(emp.email, `Metal Fuze — تسجيل ${body.punch_type === "in" ? "حضور" : "انصراف"}`,
        `<div dir="rtl" style="font-family:sans-serif">
          <p>مرحبًا ${emp.full_name}،</p>
          <p>تم تسجيل ${body.punch_type === "in" ? "الحضور" : "الانصراف"} بتاريخ ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}.</p>
          ${distance_m !== null ? `<p>المسافة من المكتب: ${distance_m} م</p>` : ""}
          <p><a href="${signed?.signedUrl}">صورة التسجيل (صالحة لمدة 7 أيام)</a></p></div>`);
      emailed = true;
    } catch (_) { /* email is best-effort; the punch is already stored */ }
  }
  return json({ ok: true, distance_m, emailed });
});
