// User accounts (admins with accounts:write, and the developer).
// All writes go through the admin-users edge function which re-checks the
// caller's permissions server-side.
import { useState } from "react";
import { callFn, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Empty, ErrorBox, Modal, useLoad, useToast } from "../../components/ui";

export const ROLES = [
  { value: "admin", ar: "مسؤول", en: "Admin" }, { value: "executive", ar: "تنفيذي", en: "Executive" },
  { value: "hr", ar: "موارد بشرية", en: "HR" }, { value: "sales", ar: "مبيعات", en: "Sales" },
  { value: "manager", ar: "مدير مشروع", en: "Project manager" }, { value: "developer", ar: "مطوّر", en: "Developer" },
  { value: "viewer", ar: "مشاهد (قراءة فقط)", en: "Viewer (read-only)" },
];
export const MODULES = ["projects", "payments", "budget", "accounting", "bank", "project_reports", "custody", "fleet", "documents",
  "residencies", "exec_summary", "accounts", "hr", "leaves", "payroll", "settlements", "performance", "attendance", "sales", "sales_all",
  "messages", "mail", "my_checkin", "advisor", "construction", "my_projects", "my_projects_all", "dev"];

interface Account { id: string; username: string; email: string; full_name: string; full_name_en: string | null; role: string;
  suspended: boolean; can_approve_leaves: boolean; can_multi_account: boolean; is_ceo: boolean; is_supervisor: boolean;
  is_meeting_responsible: boolean; self_signup: boolean; last_sign_in_at: string | null; email_confirmed: boolean }

export default function Accounts() {
  const { t, lang, fmtDateTime } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const list = useLoad(() => callFn<Account[]>("admin-users", { action: "list" }));
  const [edit, setEdit] = useState<(Account & { modules?: { module: string; can_write: boolean }[] | null; password?: string }) | null>(null);
  const [create, setCreate] = useState<Record<string, string> | null>(null);
  const isDev = can("dev", true);
  const role = (v: string) => { const r = ROLES.find((x) => x.value === v); return r ? (lang === "ar" ? r.ar : r.en) : v; };

  const saveEdit = async () => {
    try {
      const { id, password, modules, ...patch } = edit!;
      await callFn("admin-users", { action: "update", user_id: id, patch, ...(modules !== undefined ? { modules: modules ?? [] } : {}) });
      if (password) await callFn("admin-users", { action: "set_password", user_id: id, password });
      toast.ok(t("تم الحفظ", "Saved")); setEdit(null); list.reload();
    } catch (e) { toast.error(e); }
  };
  const saveCreate = async () => {
    try { await callFn("admin-users", { action: "create", ...create }); toast.ok(t("تم إنشاء الحساب", "Account created")); setCreate(null); list.reload(); }
    catch (e) { toast.error(e); }
  };
  const flags: [keyof Account, string, string][] = [
    ["can_approve_leaves", "يعتمد الإجازات", "Approves leaves"], ["is_ceo", "الرئيس التنفيذي", "CEO"],
    ["is_supervisor", "مشرف عمال", "Supervisor"], ["is_meeting_responsible", "مسؤول اجتماعات", "Meeting owner"],
    ...(isDev ? [["can_multi_account", "تعدد الحسابات", "Multi-account"], ["suspended", "معلّق", "Suspended"]] as [keyof Account, string, string][] : []),
  ];

  return (
    <>
      <div className="page-head"><h1>{t("الحسابات والمستخدمون", "User accounts")}</h1>
        <button className="primary" onClick={() => setCreate({ role: "viewer" })}>＋ {t("حساب جديد", "New account")}</button></div>
      <ErrorBox error={list.error} />
      <div className="card flush"><div className="table-wrap">{!list.data?.length ? <Empty /> : <table className="data">
        <thead><tr><th>{t("المستخدم", "User")}</th><th>{t("الاسم", "Name")}</th><th>{t("الدور", "Role")}</th><th>{t("آخر دخول", "Last sign-in")}</th><th /></tr></thead>
        <tbody>{list.data.map((a) => <tr key={a.id}><td>{a.username}<br /><small className="muted">{a.email}</small></td><td>{a.full_name}</td>
          <td>{role(a.role)} {a.self_signup && <span className="badge info">{t("تسجيل ذاتي", "Self-signup")}</span>}
            {a.suspended && <span className="badge danger">{t("معلّق", "Suspended")}</span>}
            {!a.email_confirmed && <span className="badge warn">{t("غير مؤكد", "Unconfirmed")}</span>}</td>
          <td>{fmtDateTime(a.last_sign_in_at)}</td>
          <td className="actions"><button className="sm" onClick={() => setEdit({ ...a })}>✎</button></td></tr>)}</tbody></table>}</div></div>

      {edit && <Modal wide title={`${edit.username}`} onClose={() => setEdit(null)} footer={<button className="primary" onClick={saveEdit}>{t("حفظ", "Save")}</button>}>
        <div className="form-grid">
          <label className="field">{t("اسم المستخدم", "Username")}<input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></label>
          <label className="field">{t("الاسم", "Name")}<input value={edit.full_name ?? ""} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></label>
          <label className="field">{t("الاسم بالإنجليزية", "English name")}<input value={edit.full_name_en ?? ""} onChange={(e) => setEdit({ ...edit, full_name_en: e.target.value })} /></label>
          <label className="field">{t("الدور", "Role")}<select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
            {ROLES.filter((r) => isDev || r.value !== "developer").map((r) => <option key={r.value} value={r.value}>{lang === "ar" ? r.ar : r.en}</option>)}</select></label>
          <label className="field">{t("كلمة مرور جديدة (اختياري)", "New password (optional)")}<input type="password" minLength={8} value={edit.password ?? ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></label>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "14px 0" }}>{flags.map(([k, ar, en]) =>
          <label key={k} className="check"><input type="checkbox" checked={!!edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} />{lang === "ar" ? ar : en}</label>)}</div>
        <ModuleOverrides userId={edit.id} value={edit.modules} onChange={(m) => setEdit({ ...edit, modules: m })} />
      </Modal>}

      {create && <Modal title={t("حساب جديد", "New account")} onClose={() => setCreate(null)} footer={<button className="primary" onClick={saveCreate}>{t("إنشاء", "Create")}</button>}>
        <div className="form-grid">
          {([["username", t("اسم المستخدم", "Username")], ["email", t("البريد", "Email")], ["password", t("كلمة المرور", "Password")],
            ["full_name", t("الاسم", "Name")], ["full_name_en", t("الاسم بالإنجليزية", "English name")]] as const).map(([k, l]) =>
            <label key={k} className="field">{l}<input type={k === "password" ? "password" : k === "email" ? "email" : "text"} value={create[k] ?? ""} onChange={(e) => setCreate({ ...create, [k]: e.target.value })} /></label>)}
          <label className="field">{t("الدور", "Role")}<select value={create.role} onChange={(e) => setCreate({ ...create, role: e.target.value })}>
            {ROLES.filter((r) => isDev || r.value !== "developer").map((r) => <option key={r.value} value={r.value}>{lang === "ar" ? r.ar : r.en}</option>)}</select></label>
        </div></Modal>}
    </>
  );
}

/** Optional per-user module list that replaces the role defaults (e.g. Ali). */
function ModuleOverrides({ userId, value, onChange }: { userId: string; value?: { module: string; can_write: boolean }[] | null;
  onChange: (m: { module: string; can_write: boolean }[] | null) => void }) {
  const { t } = useI18n();
  const current = useLoad(async () => (await supabase.from("user_permissions").select("module, can_write").eq("user_id", userId)).data ?? [], [userId]);
  const list = value === undefined ? current.data ?? [] : value ?? [];
  const enabled = list.length > 0;
  const toggle = (m: string, on: boolean, write: boolean) => {
    const next = list.filter((x) => x.module !== m);
    if (on) next.push({ module: m, can_write: write });
    onChange(next);
  };
  return (
    <div className="card">
      <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? [{ module: "messages", can_write: true }] : [])} />
        <b>{t("صلاحيات مخصصة (تستبدل صلاحيات الدور)", "Custom modules (replace role defaults)")}</b></label>
      {enabled && <div className="form-grid" style={{ marginTop: 10 }}>{MODULES.map((m) => {
        const row = list.find((x) => x.module === m);
        return <div key={m} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label className="check"><input type="checkbox" checked={!!row} onChange={(e) => toggle(m, e.target.checked, false)} />{m}</label>
          {row && <label className="check"><input type="checkbox" checked={row.can_write} onChange={(e) => toggle(m, true, e.target.checked)} />{t("كتابة", "write")}</label>}
        </div>;
      })}</div>}
    </div>
  );
}
