import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";

function Brand() {
  return <div className="brand"><img src="/icons/logo.svg" alt="" /><div><b>METAL FUZE</b><small>PROJECTS</small></div></div>;
}

export function Login({ suspended }: { suspended?: boolean }) {
  const { signIn, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(suspended ? "suspended" : "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await signIn(id, pw); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  const msg: Record<string, string> = {
    invalid_credentials: t("اسم المستخدم أو كلمة المرور غير صحيحة", "Wrong username or password"),
    blocked: t("الدخول غير مسموح لهذا الحساب الآن (الوقت/الشبكة/الجهاز).", "Sign-in is not allowed for this account right now (hours/network/device)."),
    suspended: t("هذا الحساب معلّق. تواصل مع المطوّر.", "This account is suspended. Contact the developer."),
  };
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <Brand />
        <h1>{t("تسجيل الدخول", "Sign in")}</h1>
        {err && <div className="alert error">{msg[err] ?? err}</div>}
        {suspended ? <button type="button" onClick={() => signOut()}>{t("خروج", "Sign out")}</button> : <>
          <label className="field">{t("اسم المستخدم أو البريد", "Username or email")}
            <input autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} required autoFocus /></label>
          <label className="field">{t("كلمة المرور", "Password")}
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
          <button className="primary" disabled={busy}>{busy ? "…" : t("دخول", "Sign in")}</button>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <Link to="/signup">{t("تسجيل مدير مشروع جديد", "Project manager sign-up")}</Link>
            <a href="#" onClick={(e) => { e.preventDefault(); setLang(lang === "ar" ? "en" : "ar"); }}>{lang === "ar" ? "English" : "عربي"}</a>
          </div>
        </>}
      </form>
    </div>
  );
}

/** Self-signup for project managers: they only get "My projects". */
export function Signup() {
  const { t } = useI18n();
  const [f, setF] = useState({ full_name: "", username: "", email: "", password: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const { error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { data: { full_name: f.full_name, username: f.username }, emailRedirectTo: location.origin },
    });
    if (error) setErr(error.message); else setDone(true);
  };
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <Brand />
        <h1>{t("تسجيل مدير مشروع", "Project manager sign-up")}</h1>
        {done ? <div className="alert ok">{t("تم إرسال رسالة تأكيد إلى بريدك. بعد التأكيد يمكنك الدخول وسيتم ربط حسابك بملف الموظف تلقائيًا.",
          "We sent a confirmation email. After confirming you can sign in, and your account will be linked to your employee record.")}</div> : <>
          {err && <div className="alert error">{err}</div>}
          <label className="field">{t("الاسم الكامل", "Full name")}<input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></label>
          <label className="field">{t("اسم المستخدم", "Username")}<input value={f.username} pattern="[a-zA-Z0-9._-]{3,}" onChange={(e) => setF({ ...f, username: e.target.value })} required /></label>
          <label className="field">{t("البريد الإلكتروني", "Email")}<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
          <label className="field">{t("كلمة المرور", "Password")}<input type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
          <button className="primary">{t("تسجيل", "Sign up")}</button>
        </>}
        <Link to="/">{t("لديك حساب؟ تسجيل الدخول", "Have an account? Sign in")}</Link>
      </form>
    </div>
  );
}
