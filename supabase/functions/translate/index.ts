// Display-only Arabic → English translation with a shared cache.
// Translations are never written back to the source records.
import { admin, callerId } from "../_shared/clients.ts";
import { claude } from "../_shared/claude.ts";
import { json, preflight } from "../_shared/cors.ts";

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!(await callerId(req))) return json({ error: "unauthorized" }, 401);
  const { texts } = await req.json() as { texts: string[] };
  const unique = [...new Set((texts ?? []).filter((t) => typeof t === "string" && t.trim()))].slice(0, 100);
  const hashes = await Promise.all(unique.map(sha));
  const { data: cached } = await admin.from("translations").select("hash, en").in("hash", hashes);
  const found = new Map((cached ?? []).map((r) => [r.hash, r.en]));
  const missing = unique.filter((_, i) => !found.has(hashes[i]));

  if (missing.length) {
    const reply = await claude(
      "Translate each Arabic string to concise English as used in a construction company's internal system. " +
      "Keep names transliterated, numbers unchanged. Reply ONLY with a JSON array of strings in the same order.",
      [{ role: "user", content: JSON.stringify(missing) }], 4000);
    const arr: string[] = JSON.parse(reply.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
    const rows = await Promise.all(missing.map(async (src, i) => ({ hash: await sha(src), source: src, en: arr[i] ?? src })));
    await admin.from("translations").upsert(rows, { onConflict: "hash" });
    rows.forEach((r) => found.set(r.hash, r.en));
  }
  const out: Record<string, string> = {};
  unique.forEach((t, i) => { out[t] = found.get(hashes[i]) ?? t; });
  return json({ translations: out });
});
