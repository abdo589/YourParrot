import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Service-role client: bypasses RLS — only use after checking the caller. */
export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

/** Client acting as the caller: every query goes through the caller's RLS. */
export function asCaller(req: Request): SupabaseClient {
  const headers: Record<string, string> = { Authorization: req.headers.get("Authorization") ?? "" };
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) headers["x-forwarded-for"] = fwd;
  const dev = req.headers.get("x-device-id");
  if (dev) headers["x-device-id"] = dev;
  return createClient(url, anonKey, { global: { headers }, auth: { persistSession: false } });
}

/** Resolves the signed-in caller or returns null. */
export async function callerId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

/** Same permission check the database uses (app.can), evaluated as the caller. */
export async function callerCan(req: Request, module: string, write = false): Promise<boolean> {
  const { data, error } = await asCaller(req).rpc("my_permissions");
  if (error || !data) return false;
  return (data as { module: string; can_write: boolean }[])
    .some((p) => p.module === module && (!write || p.can_write));
}
