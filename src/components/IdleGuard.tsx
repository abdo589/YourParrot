// Auto sign-out after 1 hour without activity, with a warning 5 minutes before.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Modal } from "./ui";

const LIMIT = 60 * 60 * 1000;
const WARN = 5 * 60 * 1000;
const KEY = "mf-last-activity";

export function IdleGuard() {
  const { session, signOut } = useAuth();
  const { t } = useI18n();
  const [left, setLeft] = useState<number | null>(null);
  const last = useRef(Date.now());

  useEffect(() => {
    if (!session) return;
    const bump = () => {
      const now = Date.now();
      if (now - last.current < 15_000) return;
      last.current = now;
      try { localStorage.setItem(KEY, String(now)); } catch { /* ignore */ }
    };
    last.current = Date.now(); bump();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const tick = setInterval(() => {
      // activity in other tabs counts too
      let shared = last.current;
      try { shared = Math.max(shared, Number(localStorage.getItem(KEY)) || 0); } catch { /* ignore */ }
      const remaining = shared + LIMIT - Date.now();
      if (remaining <= 0) { setLeft(null); signOut("idle_sign_out"); }
      else setLeft(remaining <= WARN ? remaining : null);
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(tick); };
  }, [session, signOut]);

  if (left === null) return null;
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const stay = () => { last.current = Date.now(); try { localStorage.setItem(KEY, String(last.current)); } catch { /* ignore */ } setLeft(null); };
  return (
    <Modal title={t("تنبيه عدم النشاط", "Inactivity warning")} onClose={stay}
      footer={<><button onClick={() => signOut()}>{t("تسجيل الخروج", "Sign out")}</button>
        <button className="primary" onClick={stay}>{t("متابعة الجلسة", "Stay signed in")}</button></>}>
      <p>{t("سيتم تسجيل خروجك تلقائيًا بعد", "You will be signed out automatically in")} <b>{m}:{String(s).padStart(2, "0")}</b></p>
    </Modal>
  );
}
