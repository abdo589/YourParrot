// Settlements: reads uploaded PDFs/images with AI and extracts hire date & salary.
import { callerCan } from "../_shared/clients.ts";
import { attachmentBlock, claude } from "../_shared/claude.ts";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!(await callerCan(req, "settlements", true))) return json({ error: "forbidden" }, 403);
  const { files } = await req.json() as { files: { name: string; mime: string; base64: string }[] };
  if (!files?.length) return json({ error: "no_files" }, 400);

  const reply = await claude(
    "You extract data from employment documents (contracts, offers, work-start forms, salary certificates), Arabic or English. " +
    "Reply with ONLY a JSON object: {\"employee_name\": string|null, \"hire_date\": \"YYYY-MM-DD\"|null, " +
    "\"salary\": number|null, \"salary_breakdown\": {\"basic\": number|null, \"housing\": number|null, \"transport\": number|null, \"other\": number|null}, " +
    "\"notes\": string}. salary is the total monthly wage in SAR. Convert Hijri dates to Gregorian.",
    [{ role: "user", content: [...files.slice(0, 5).map((f) => attachmentBlock(f.name, f.mime, f.base64)),
      { type: "text", text: "Extract the fields." }] }],
    800,
  );
  const match = reply.match(/\{[\s\S]*\}/);
  try {
    return json(JSON.parse(match?.[0] ?? "{}"));
  } catch {
    return json({ error: "unparseable", raw: reply }, 422);
  }
});
