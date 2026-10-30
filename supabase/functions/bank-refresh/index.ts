// Bank balance refresh — admin only (bank:write). Pulls from the bank
// feed configured in BANK_FEED_URL (+ BANK_FEED_TOKEN), expected to return
// [{ iban, balance, transactions: [{ id, date, description, amount, balance_after }] }].
import { admin, callerCan } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!(await callerCan(req, "bank", true))) return json({ error: "forbidden" }, 403);
  const feed = Deno.env.get("BANK_FEED_URL");
  if (!feed) return json({ error: "no_bank_feed_configured" }, 501);

  const res = await fetch(feed, { headers: { Authorization: `Bearer ${Deno.env.get("BANK_FEED_TOKEN") ?? ""}` } });
  if (!res.ok) return json({ error: `feed ${res.status}` }, 502);
  const accounts = await res.json() as {
    iban: string; balance: number;
    transactions?: { id: string; date: string; description: string; amount: number; balance_after?: number }[];
  }[];
  const now = new Date().toISOString();
  let updated = 0;
  for (const a of accounts) {
    const { data: acc } = await admin.from("bank_accounts")
      .update({ balance: a.balance, last_refreshed_at: now }).eq("iban", a.iban).select("id").maybeSingle();
    if (!acc) continue;
    updated++;
    if (a.transactions?.length) {
      await admin.from("bank_transactions").upsert(a.transactions.map((t) => ({
        bank_account_id: acc.id, external_id: t.id, tx_date: t.date, description: t.description,
        amount: t.amount, balance_after: t.balance_after ?? null,
      })), { onConflict: "bank_account_id,external_id", ignoreDuplicates: true });
    }
  }
  return json({ ok: true, updated });
});
