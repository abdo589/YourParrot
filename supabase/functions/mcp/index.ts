// MCP server (streamable HTTP, JSON responses). Authenticate with the
// user's own Supabase access token: every tool call runs through that
// user's RLS, so the server can never see more than the user can.
import { asCaller, callerId } from "../_shared/clients.ts";
import { corsHeaders } from "../_shared/cors.ts";

const READABLE = [
  "projects", "payments", "budget_items", "accounting_entries", "bank_accounts", "custody_items", "vehicles",
  "company_documents", "residencies", "exec_summary", "employees", "leaves", "leave_balances", "attendance_daily",
  "payroll_items", "establishment_payroll", "settlements", "performance_reviews", "quote_requests", "sales_meetings",
  "cp_projects", "cp_project_totals", "submissions_view", "cp_invoices_view", "cp_activities", "cp_daily_reports",
  "cp_dashboard", "my_projects", "my_project_reports", "messages", "notifications",
];

const TOOLS = [
  { name: "my_permissions", description: "Modules the current user may read/write.", inputSchema: { type: "object", properties: {} } },
  {
    name: "query", description: `Read rows from a table/view the user can access. Tables: ${READABLE.join(", ")}`,
    inputSchema: {
      type: "object", required: ["table"],
      properties: {
        table: { type: "string", enum: READABLE },
        select: { type: "string", description: "PostgREST select list, default *" },
        filters: { type: "object", description: "column → exact value", additionalProperties: true },
        order: { type: "string", description: "column, prefix with - for desc" },
        limit: { type: "integer", maximum: 500, default: 100 },
      },
    },
  },
  {
    name: "projects_in_period", description: "Projects whose dates overlap a period (current cumulative figures).",
    inputSchema: { type: "object", required: ["from", "to"], properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" } } },
  },
  {
    name: "send_message", description: "Send an internal message to another user (by username).",
    inputSchema: { type: "object", required: ["username", "body"], properties: { username: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };
const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function callTool(req: Request, name: string, args: Record<string, unknown>) {
  const db = asCaller(req);
  if (name === "my_permissions") return (await db.rpc("my_permissions")).data;
  if (name === "projects_in_period") {
    const { data, error } = await db.rpc("projects_in_period", { p_from: args.from, p_to: args.to });
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "query") {
    const table = String(args.table);
    if (!READABLE.includes(table)) throw new Error("table not allowed");
    let q = db.from(table).select(String(args.select ?? "*"));
    for (const [k, v] of Object.entries((args.filters ?? {}) as Record<string, unknown>)) q = q.eq(k, v as string);
    if (args.order) { const o = String(args.order); q = q.order(o.replace(/^-/, ""), { ascending: !o.startsWith("-") }); }
    const { data, error } = await q.limit(Math.min(Number(args.limit ?? 100), 500));
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "send_message") {
    const { data: to } = await db.from("directory").select("id").eq("username", String(args.username)).maybeSingle();
    if (!to) throw new Error("unknown user");
    const { error } = await db.from("messages").insert({ recipient_id: to.id, subject: args.subject ?? null, body: String(args.body) });
    if (error) throw new Error(error.message);
    return { sent: true };
  }
  throw new Error(`unknown tool ${name}`);
}

async function handle(req: Request, msg: Rpc) {
  switch (msg.method) {
    case "initialize":
      return reply(msg.id, {
        protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "metal-fuze-projects", version: "1.0.0" },
      });
    case "ping": return reply(msg.id, {});
    case "tools/list": return reply(msg.id, { tools: TOOLS });
    case "tools/call": {
      const p = msg.params as { name: string; arguments?: Record<string, unknown> };
      try {
        const data = await callTool(req, p.name, p.arguments ?? {});
        return reply(msg.id, { content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });
      } catch (e) {
        return reply(msg.id, { content: [{ type: "text", text: String(e) }], isError: true });
      }
    }
    default: return msg.id === undefined ? null : fail(msg.id, -32601, "method not found");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(await callerId(req))) {
    return new Response(JSON.stringify(fail(null as unknown as number, -32001, "unauthorized")), { status: 401 });
  }
  const body = await req.json();
  const out = Array.isArray(body)
    ? (await Promise.all(body.map((m: Rpc) => handle(req, m)))).filter(Boolean)
    : await handle(req, body);
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202, headers: corsHeaders });
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
