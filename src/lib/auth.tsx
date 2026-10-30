import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { callFn, deviceId, rememberAccount, supabase } from "./supabase";

export type Role = "admin" | "executive" | "hr" | "sales" | "manager" | "developer" | "viewer";
export interface Profile {
  id: string; username: string; email: string; full_name: string; full_name_en: string | null; role: Role;
  employee_id: string | null; can_approve_leaves: boolean; can_multi_account: boolean; is_ceo: boolean;
  is_supervisor: boolean; is_meeting_responsible: boolean; suspended: boolean; self_signup: boolean;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  blocked: boolean;
  /** Mirrors app.can() in the database (the DB remains the authority). */
  can: (module: string, write?: boolean) => boolean;
  perms: Map<string, boolean>;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: (reason?: "sign_out" | "idle_sign_out") => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [perms, setPerms] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setProfile(null); setPerms(new Map()); setLoading(false); return; }
    const [{ data: p }, { data: pr }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.rpc("my_permissions"),
    ]);
    setProfile(p as Profile | null);
    const m = new Map<string, boolean>();
    for (const row of (pr ?? []) as { module: string; can_write: boolean }[]) m.set(row.module, (m.get(row.module) ?? false) || row.can_write);
    setPerms(m);
    if (p) rememberAccount((p as Profile).full_name || (p as Profile).username);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") { setSession(s); return; }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    setBlocked(false);
    let email = identifier.trim();
    if (!email.includes("@")) {
      const { data } = await supabase.rpc("email_for_username", { p_username: email });
      if (!data) throw new Error("invalid_credentials");
      email = data as string;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("invalid_credentials");
    // IP/location are recorded server-side; access rules (hours/IP/device) are checked there too.
    const res = await callFn<{ allowed: boolean }>("audit", { event: "sign_in", device_id: deviceId() }).catch(() => ({ allowed: true }));
    if (!res.allowed) {
      await supabase.auth.signOut({ scope: "local" });
      setBlocked(true);
      throw new Error("blocked");
    }
  }, []);

  const signOut = useCallback(async (reason: "sign_out" | "idle_sign_out" = "sign_out") => {
    await callFn("audit", { event: reason, device_id: deviceId() }).catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const can = useCallback((module: string, write = false) => {
    if (!profile || profile.suspended) return false;
    const w = perms.get(module);
    return w !== undefined && (!write || w);
  }, [perms, profile]);

  return (
    <Ctx.Provider value={{ session, profile, loading, blocked, can, perms, signIn, signOut, reload: () => load(session) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
