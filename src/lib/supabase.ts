import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function safeGet(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

/** Stable per-device id, sent on every request so the DB can apply device rules. */
export function deviceId(): string {
  let id = safeGet("mf-device-id");
  if (!id) { id = crypto.randomUUID(); safeSet("mf-device-id", id); }
  return id;
}

// ---- Multi-account (Eilaf only; gated by profiles.can_multi_account) ----
export interface SavedAccount { key: string; label: string }
export const activeAccountKey = safeGet("mf-active-account") ?? "main";

export function savedAccounts(): SavedAccount[] {
  try { return JSON.parse(safeGet("mf-accounts") ?? "[]"); } catch { return []; }
}
export function rememberAccount(label: string) {
  const list = savedAccounts().filter((a) => a.key !== activeAccountKey);
  list.push({ key: activeAccountKey, label });
  safeSet("mf-accounts", JSON.stringify(list));
}
export function forgetAccount(key: string) {
  safeSet("mf-accounts", JSON.stringify(savedAccounts().filter((a) => a.key !== key)));
  try { localStorage.removeItem(`mf-auth-${key}`); } catch { /* ignore */ }
}
export function switchAccount(key: string) {
  safeSet("mf-active-account", key);
  location.assign("/");
}
export function addAccount() {
  switchAccount(`acct-${Date.now().toString(36)}`);
}

export const supabase = createClient(URL, KEY, {
  auth: { storageKey: `mf-auth-${activeAccountKey}`, persistSession: true, autoRefreshToken: true },
  global: { headers: { "x-device-id": deviceId() } },
});

/** Calls an edge function and throws a readable error. */
export async function callFn<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}

export const functionsUrl = `${URL}/functions/v1`;

export async function signedUrl(bucket: string, path: string, seconds = 600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
