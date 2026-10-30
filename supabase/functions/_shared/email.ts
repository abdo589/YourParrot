// Transactional email via Resend (set RESEND_API_KEY and MAIL_FROM).
export interface Attachment { filename: string; content: string /* base64 */ }

export async function sendEmail(to: string, subject: string, html: string, attachments: Attachment[] = []) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MAIL_FROM") ?? "Metal Fuze <no-reply@metalfuze.sa>",
      to: [to], subject, html, attachments,
    }),
  });
  if (!res.ok) throw new Error(`email failed: ${res.status} ${await res.text()}`);
}
