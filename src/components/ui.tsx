import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { friendlyError } from "../lib/errors";

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { width: "min(1100px, 100%)" } : undefined} role="dialog" aria-modal>
        <header><h2>{title}</h2><button className="ghost icon" onClick={onClose} aria-label="close">✕</button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

interface ToastApi { ok: (m: string) => void; error: (e: unknown) => void }
const ToastCtx = createContext<ToastApi>({ ok: () => {}, error: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4500); return () => clearTimeout(id); }, [toast]);
  const api: ToastApi = {
    ok: (msg) => setToast({ msg, err: false }),
    error: (e) => setToast({ msg: friendlyError(e, t), err: true }),
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {toast && <div className={`toast ${toast.err ? "error" : ""}`} role="status">{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; hidden?: boolean }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.filter((x) => !x.hidden).map((x) => (
        <button key={x.id} role="tab" aria-selected={x.id === value} className={x.id === value ? "on" : ""} onClick={() => onChange(x.id)}>
          {x.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: "accent" | "danger" }) {
  return <div className={`kpi ${tone ?? ""}`}><span>{label}</span><b>{value}</b></div>;
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div className="bar" style={{ flex: 1 }}><i style={{ width: `${v}%` }} /></div><small>{v}%</small></div>;
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="empty">{children ?? t("لا توجد بيانات", "No data")}</div>;
}

/** Small data loader with reload. */
export function useLoad<T>(fn: () => PromiseLike<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    setLoading(true);
    return Promise.resolve(fn()).then((d) => { setData(d); setError(null); }, setError).finally(() => setLoading(false));
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  return <div className="alert error">{friendlyError(error, t)}</div>;
}

/** Unwraps a Supabase response or throws. */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
