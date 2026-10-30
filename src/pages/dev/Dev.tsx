// Developer console (/dev): bug inbox, accounts, sign-in/out audit,
// trigger-based activity log, force sign-out / suspend, access rules, MCP.
import { useState } from "react";
import { functionsUrl, supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { CrudPage, type Row } from "../../components/CrudPage";
import { Modal, Tabs, useLoad, useToast } from "../../components/ui";
import Accounts from "./Accounts";

type Tab = "bugs" | "accounts" | "audit" | "activity" | "sessions" | "rules" | "mcp";

export default function Dev() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("bugs");
  return (
    <>
      <div className="page-head"><h1>{t("لوحة المطوّر", "Developer console")}</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "bugs", label: t("صندوق الأعطال", "Bug inbox") }, { id: "accounts", label: t("الحسابات", "Accounts") },
        { id: "audit", label: t("سجل الدخول والخروج", "Sign-in audit") }, { id: "activity", label: t("سجل النشاط", "Activity log") },
        { id: "sessions", label: t("الجلسات والتعليق", "Sessions & suspension") }, { id: "rules", label: t("قواعد الوصول", "Access rules") },
        { id: "mcp", label: "MCP" },
      ]} />
      {tab === "bugs" && <CrudPage table="bug_reports" module="dev" title={{ ar: "البلاغات والأخطاء التلقائية", en: "Reports & auto-captured errors" }}
        orderBy={{ column: "created_at" }} allowDelete={false} fields={[
          { key: "created_at", ar: "الوقت", en: "Time", type: "datetime", readOnly: true },
          { key: "kind", ar: "النوع", en: "Kind", type: "select", readOnly: true, options: [
            { value: "report", ar: "بلاغ مستخدم", en: "User report", tone: "info" }, { value: "auto", ar: "خطأ تلقائي", en: "Auto error", tone: "danger" }] },
          { key: "user_id", ar: "المستخدم", en: "User", type: "ref", readOnly: true, ref: { table: "directory", label: "full_name" } },
          { key: "message", ar: "الرسالة", en: "Message", readOnly: true },
          { key: "url", ar: "الصفحة", en: "Page", readOnly: true },
          { key: "stack", ar: "التتبع", en: "Stack", readOnly: true, hideInTable: true, render: (r) => <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }} dir="ltr">{r.stack}</pre> },
          { key: "user_agent", ar: "المتصفح", en: "Browser", readOnly: true, hideInTable: true },
          { key: "status", ar: "الحالة", en: "Status", type: "select", options: [
            { value: "open", ar: "مفتوح", en: "Open", tone: "danger" }, { value: "in_progress", ar: "قيد العمل", en: "In progress", tone: "warn" },
            { value: "resolved", ar: "تم الحل", en: "Resolved", tone: "ok" }] },
        ]} />}
      {tab === "accounts" && <Accounts />}
      {tab === "audit" && <CrudPage table="auth_events" module="dev" canWrite={false} title={{ ar: "سجل الدخول والخروج", en: "Sign-in / sign-out audit" }}
        orderBy={{ column: "at" }} fields={[
          { key: "at", ar: "الوقت", en: "Time", type: "datetime" },
          { key: "user_id", ar: "المستخدم", en: "User", type: "ref", ref: { table: "directory", label: "full_name" } },
          { key: "event", ar: "الحدث", en: "Event", type: "select", options: [
            { value: "sign_in", ar: "دخول", en: "Sign in", tone: "ok" }, { value: "sign_out", ar: "خروج", en: "Sign out" },
            { value: "idle_sign_out", ar: "خروج تلقائي", en: "Idle sign-out", tone: "warn" },
            { value: "forced_sign_out", ar: "إنهاء جلسة", en: "Forced sign-out", tone: "danger" }, { value: "blocked", ar: "محظور", en: "Blocked", tone: "danger" }] },
          { key: "ip", ar: "IP", en: "IP" }, { key: "country", ar: "الدولة", en: "Country" }, { key: "city", ar: "المدينة", en: "City" },
          { key: "device_id", ar: "الجهاز", en: "Device", render: (r) => <code style={{ fontSize: 11 }}>{r.device_id?.slice(0, 8)}</code> },
          { key: "user_agent", ar: "المتصفح", en: "Browser", hideInTable: true },
        ]} />}
      {tab === "activity" && <Activity />}
      {tab === "sessions" && <Sessions />}
      {tab === "rules" && <CrudPage table="access_rules" module="dev" title={{ ar: "قواعد الوصول لكل حساب", en: "Per-account access rules" }}
        orderBy={{ column: "updated_at" }} fields={[
          { key: "user_id", ar: "الحساب", en: "Account", type: "ref", required: true, ref: { table: "directory", label: "full_name" } },
          { key: "hours_from", ar: "من الساعة (الرياض)", en: "From (Riyadh time)", type: "time" },
          { key: "hours_to", ar: "إلى الساعة", en: "To", type: "time" },
          { key: "allowed_ips", ar: "عناوين IP المسموحة (فاصلة)", en: "Allowed IPs (comma)", type: "tags" },
          { key: "allowed_devices", ar: "الأجهزة المسموحة (معرّف الجهاز)", en: "Allowed devices (device id)", type: "tags" },
          { key: "note", ar: "ملاحظة", en: "Note" },
        ]} />}
      {tab === "mcp" && <Mcp />}
    </>
  );
}

function Activity() {
  const { t, fmtDateTime } = useI18n();
  const [table, setTable] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const rows = useLoad(async () => {
    let q = supabase.from("activity_log").select("*").order("at", { ascending: false }).limit(300);
    if (table) q = q.eq("table_name", table);
    return (await q).data ?? [];
  }, [table]);
  const people = useLoad(async () => (await supabase.from("directory").select("id, full_name")).data ?? []);
  const who = (id: string) => (people.data as Row[] ?? []).find((p) => p.id === id)?.full_name ?? (id ? id.slice(0, 8) : t("النظام", "system"));
  const changed = (r: Row) => r.op !== "UPDATE" ? "" : Object.keys(r.new_data ?? {}).filter((k) =>
    !["updated_at", "version"].includes(k) && JSON.stringify(r.new_data[k]) !== JSON.stringify(r.old_data?.[k])).join(", ");
  return (
    <div className="card flush">
      <div className="card-head" style={{ padding: 12, margin: 0 }}><h2>{t("سجل النشاط (من triggers قاعدة البيانات)", "Activity log (database triggers)")}</h2>
        <input placeholder={t("اسم الجدول", "Table name")} value={table} onChange={(e) => setTable(e.target.value.trim())} style={{ width: 200 }} /></div>
      <div className="table-wrap"><table className="data"><tbody>{(rows.data as Row[] ?? []).map((r) => <tr key={r.id} onClick={() => setDetail(r)} style={{ cursor: "pointer" }}>
        <td>{fmtDateTime(r.at)}</td><td>{who(r.user_id)}</td><td><code>{r.table_name}</code></td>
        <td><span className={`badge ${r.op === "DELETE" ? "danger" : r.op === "INSERT" ? "ok" : "info"}`}>{r.op}</span></td>
        <td className="muted">{changed(r)}</td></tr>)}</tbody></table></div>
      {detail && <Modal wide title={`${detail.table_name} · ${detail.op}`} onClose={() => setDetail(null)}>
        <div className="cols-2"><pre dir="ltr" style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{JSON.stringify(detail.old_data, null, 1)}</pre>
          <pre dir="ltr" style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{JSON.stringify(detail.new_data, null, 1)}</pre></div></Modal>}
    </div>
  );
}

function Sessions() {
  const { t } = useI18n();
  const toast = useToast();
  const people = useLoad(async () => (await supabase.from("profiles").select("id, username, full_name, suspended").order("username")).data ?? []);
  const force = async (id: string) => {
    if (!confirm(t("إنهاء كل جلسات هذا الحساب؟", "End all sessions for this account?"))) return;
    const { error } = await supabase.rpc("dev_force_signout", { p_user: id });
    if (error) toast.error(error); else toast.ok(t("تم إنهاء الجلسات", "Sessions ended"));
  };
  const suspend = async (id: string, on: boolean) => {
    const { error } = await supabase.rpc("dev_set_suspended", { p_user: id, p_suspended: on });
    if (error) toast.error(error); else people.reload();
  };
  return (
    <div className="card flush"><p className="muted" style={{ padding: 12 }}>{t("إنهاء الجلسة يلغي رموز التحديث فورًا؛ الرمز الحالي ينتهي خلال دقائق، والتعليق يمنع أي وصول للبيانات فورًا من قاعدة البيانات.",
      "Force sign-out revokes refresh tokens immediately (the current access token expires within minutes); suspension blocks all data access in the database immediately.")}</p>
      <table className="data"><tbody>{(people.data as Row[] ?? []).map((p) => <tr key={p.id}><td>{p.username}</td><td>{p.full_name}</td>
        <td>{p.suspended && <span className="badge danger">{t("معلّق", "Suspended")}</span>}</td>
        <td className="actions"><button className="sm" onClick={() => force(p.id)}>⏏ {t("إنهاء الجلسة", "Force sign-out")}</button>
          <button className={`sm ${p.suspended ? "" : "danger"}`} onClick={() => suspend(p.id, !p.suspended)}>{p.suspended ? t("إلغاء التعليق", "Unsuspend") : t("تعليق", "Suspend")}</button></td></tr>)}</tbody></table>
    </div>
  );
}

function Mcp() {
  const { t } = useI18n();
  const url = `${functionsUrl}/mcp`;
  const config = JSON.stringify({ mcpServers: { "metal-fuze": { type: "http", url, headers: { Authorization: "Bearer <your Supabase access token>" } } } }, null, 2);
  return (
    <div className="card">
      <h2>{t("خادم MCP", "MCP server")}</h2>
      <p className="muted">{t("يعمل الخادم بصلاحيات المستخدم نفسه: كل استعلام يمر عبر سياسات RLS الخاصة بصاحب الرمز.",
        "The server runs with the caller's own permissions: every query goes through the token owner's RLS policies.")}</p>
      <pre dir="ltr" style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflowX: "auto" }}>{config}</pre>
      <p className="muted">{t("الأدوات: my_permissions، query، projects_in_period، send_message", "Tools: my_permissions, query, projects_in_period, send_message")}</p>
    </div>
  );
}
