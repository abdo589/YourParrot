// Floating AI advisor. The system snapshot is read *as the caller*, so the
// model only ever sees what the user's own RLS permissions allow.
import { asCaller, callerId } from "../_shared/clients.ts";
import { attachmentBlock, claude, type ContentBlock, type Message } from "../_shared/claude.ts";
import { json, preflight } from "../_shared/cors.ts";

const SNAPSHOT_QUERIES: Record<string, (db: ReturnType<typeof asCaller>) => PromiseLike<{ data: unknown }>> = {
  permissions: (db) => db.rpc("my_permissions"),
  executive_summary: (db) => db.from("exec_summary").select("*").maybeSingle(),
  projects: (db) => db.from("projects").select("name, client, sector, project_manager, contract_value, received, progress, status, start_date, end_date").is("deleted_at", null).limit(300),
  recent_payments: (db) => db.from("payments").select("receipt_no, amount, paid_on, method, projects(name)").is("deleted_at", null).order("paid_on", { ascending: false }).limit(50),
  budget: (db) => db.from("budget_items").select("category, planned, actual, period").limit(200),
  construction_dashboard: (db) => db.from("cp_dashboard").select("*").maybeSingle(),
  construction_projects: (db) => db.from("cp_project_totals").select("*").limit(100),
  pending_leaves: (db) => db.from("leaves").select("leave_type, start_date, end_date, status, employees(full_name)").eq("status", "pending").limit(50),
  quotes: (db) => db.from("quote_requests").select("ref_no, client_name, project_title, stage, value_pre_vat, commission").order("created_at", { ascending: false }).limit(100),
  my_projects: (db) => db.from("my_projects").select("name, client, status, progress").limit(100),
};

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!(await callerId(req))) return json({ error: "unauthorized" }, 401);

  const { messages, attachments = [], lang = "ar" } = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    attachments?: { name: string; mime: string; base64: string }[];
    lang?: string;
  };
  if (!Array.isArray(messages) || !messages.length) return json({ error: "no_messages" }, 400);

  const db = asCaller(req);
  const snapshot: Record<string, unknown> = {};
  await Promise.all(Object.entries(SNAPSHOT_QUERIES).map(async ([key, q]) => {
    try {
      const { data } = await q(db);
      if (data && (!Array.isArray(data) || data.length)) snapshot[key] = data;
    } catch { /* not permitted → simply absent */ }
  }));

  const system = `You are the internal advisor of Metal Fuze, a contracting company (dashboard "METAL FUZE PROJECTS").
Answer in ${lang === "en" ? "English" : "Arabic"}, concisely, with numbers in SAR where relevant.
You only know the data below — it is already limited to what this user may see. Never invent figures; if something is not in the snapshot, say you cannot see it.
Today: ${new Date().toISOString().slice(0, 10)}.
<system_snapshot>${JSON.stringify(snapshot).slice(0, 150_000)}</system_snapshot>`;

  const history: Message[] = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  if (attachments.length) {
    const last = history[history.length - 1];
    const blocks: ContentBlock[] = attachments.slice(0, 5).map((a) => attachmentBlock(a.name, a.mime, a.base64));
    blocks.push({ type: "text", text: typeof last.content === "string" ? last.content : "" });
    last.content = blocks;
  }
  try {
    return json({ reply: await claude(system, history, 2048) });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
