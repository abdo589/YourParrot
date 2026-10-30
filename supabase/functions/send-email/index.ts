// Sales: email a quote PDF straight to the client. The quote is loaded
// as the caller, so a sales user can only send her own quotes.
import { asCaller } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const { quote_id, to, subject, message, pdf_base64 } = await req.json();
  const { data: q, error } = await asCaller(req).from("quote_requests")
    .select("ref_no, client_name, client_email, project_title").eq("id", quote_id).maybeSingle();
  if (error || !q) return json({ error: "forbidden" }, 403);
  const recipient = to || q.client_email;
  if (!recipient) return json({ error: "no_recipient" }, 400);
  try {
    await sendEmail(recipient, subject || `عرض سعر ${q.ref_no} — ${q.project_title}`,
      `<div dir="rtl" style="font-family:sans-serif;white-space:pre-wrap">${String(message ?? "").replace(/</g, "&lt;")}</div>`,
      pdf_base64 ? [{ filename: `${q.ref_no}.pdf`, content: pdf_base64 }] : []);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
