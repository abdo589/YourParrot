// Attendance console: daily sheet (09:00 start, late after 09:30), raw logs
// with selfies, ZKTeco devices (approve serials), supervisor punches.
import { useState } from "react";
import { signedUrl, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n, todayISO } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf } from "../../lib/pdf";
import { CrudPage } from "../../components/CrudPage";
import { Empty, Kpi, Tabs, useLoad, useToast } from "../../components/ui";

const time = (d?: string | null) => (d ? new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "—");

export default function Attendance() {
  const { t } = useI18n();
  const { can, profile } = useAuth();
  const [tab, setTab] = useState<"daily" | "logs" | "devices" | "supervisor">("daily");
  return (
    <>
      <div className="page-head"><h1>{t("الحضور والانصراف", "Attendance")}</h1><span className="muted">{t("الدوام 09:00 — التأخير بعد 09:30", "Starts 09:00 — late after 09:30")}</span></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "daily", label: t("الكشف اليومي", "Daily sheet") },
        { id: "logs", label: t("السجلات", "Logs") },
        { id: "devices", label: t("أجهزة البصمة", "Devices") },
        { id: "supervisor", label: t("تسجيل المشرف", "Supervisor punch"), hidden: !(can("attendance", true) || profile?.is_supervisor) },
      ]} />
      {tab === "daily" && <Daily />}
      {tab === "logs" && <Logs />}
      {tab === "devices" && <CrudPage table="attendance_devices" module="attendance" title={{ ar: "أجهزة ZKTeco", en: "ZKTeco devices" }}
        orderBy={{ column: "created_at" }} fields={[
          { key: "serial_no", ar: "الرقم التسلسلي", en: "Serial number", required: true },
          { key: "name", ar: "الاسم/الموقع", en: "Name / location" },
          { key: "approved", ar: "معتمد", en: "Approved", type: "bool" },
          { key: "last_seen_at", ar: "آخر اتصال", en: "Last seen", type: "datetime", readOnly: true },
        ]} />}
      {tab === "supervisor" && <SupervisorPunch />}
    </>
  );
}

function Daily() {
  const { t, lang, fmtDate } = useI18n();
  const [day, setDay] = useState(todayISO());
  const { data } = useLoad(async () => {
    const [d, e] = await Promise.all([
      supabase.from("attendance_daily").select("*").eq("work_date", day),
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
    ]);
    return { days: d.data ?? [], emps: e.data ?? [] };
  }, [day]);
  const rows = (data?.emps ?? []).map((e: any) => ({ ...e, ...(data!.days.find((d: any) => d.employee_id === e.id) ?? {}) }));
  const present = rows.filter((r: any) => r.first_in).length;
  const late = rows.filter((r: any) => r.is_late).length;
  const state = (r: any) => (!r.first_in ? t("غائب", "Absent") : r.is_late ? t("متأخر", "Late") : t("حاضر", "Present"));
  const pdf = () => exportPdf({
    title: t("كشف الحضور اليومي", "Daily attendance"), subtitle: fmtDate(day), lang, filename: `attendance-${day}`, orientation: "portrait",
    sections: [{ columns: [
      { header: t("الموظف", "Employee"), value: (r) => r.full_name as string },
      { header: t("الحضور", "In"), value: (r) => time(r.first_in as string) },
      { header: t("الانصراف", "Out"), value: (r) => time(r.last_out as string) },
      { header: t("دقائق بعد 09:00", "Min after 09:00"), value: (r) => (r.first_in ? String(r.minutes_after_start) : "") },
      { header: t("الحالة", "Status"), value: (r) => state(r) },
    ], rows }],
  });
  return (
    <div className="card flush">
      <div className="card-head" style={{ padding: 12, margin: 0 }}>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 170 }} /><span style={{ flex: 1 }} />
        <button onClick={pdf}>⬇ PDF</button></div>
      <div className="kpis" style={{ padding: "0 12px 12px" }}>
        <Kpi label={t("حاضر", "Present")} value={present} /><Kpi label={t("متأخر", "Late")} value={late} tone="danger" />
        <Kpi label={t("غائب", "Absent")} value={rows.length - present} /></div>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("الموظف", "Employee")}</th><th>{t("الحضور", "In")}</th><th>{t("الانصراف", "Out")}</th><th>{t("الحالة", "Status")}</th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.id}><td><Tx>{r.full_name}</Tx></td><td>{time(r.first_in)}</td><td>{time(r.last_out)}</td>
          <td><span className={`badge ${!r.first_in ? "" : r.is_late ? "danger" : "ok"}`}>{state(r)}</span>
            {r.is_late && <small className="muted"> +{r.minutes_after_start - 30}{t("د", "m")}</small>}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

function Logs() {
  const toast = useToast();
  const show = async (p: string) => { try { window.open(await signedUrl("selfies", p, 300), "_blank", "noopener"); } catch (e) { toast.error(e); } };
  return <CrudPage table="attendance_logs" module="attendance" canWrite={false} title={{ ar: "سجلات البصمة", en: "Punch logs" }}
    select="*, employees(full_name)" orderBy={{ column: "punched_at" }}
    rowActions={(r) => r.selfie_path && <button className="sm" onClick={() => show(r.selfie_path)}>📷</button>}
    fields={[
      { key: "employee_id", ar: "الموظف", en: "Employee", render: (r) => <Tx>{r.employees?.full_name}</Tx>, pdf: (r) => r.employees?.full_name },
      { key: "punched_at", ar: "الوقت", en: "Time", type: "datetime" },
      { key: "punch_type", ar: "النوع", en: "Type", type: "select", options: [
        { value: "in", ar: "حضور", en: "In", tone: "ok" }, { value: "out", ar: "انصراف", en: "Out", tone: "info" }, { value: "auto", ar: "بصمة", en: "Punch" }] },
      { key: "source", ar: "المصدر", en: "Source", type: "select", options: [
        { value: "device", ar: "جهاز", en: "Device" }, { value: "phone", ar: "رابط الجوال", en: "Phone link" },
        { value: "self", ar: "تسجيل حضوري", en: "My check-in" }, { value: "supervisor", ar: "المشرف", en: "Supervisor" }] },
      { key: "distance_m", ar: "البعد عن المكتب (م)", en: "Distance (m)", type: "number" },
      { key: "device_serial", ar: "الجهاز", en: "Device" },
    ]} />;
}

function SupervisorPunch() {
  const { t } = useI18n();
  const { can, profile } = useAuth();
  const toast = useToast();
  const workers = useLoad(async () => {
    let q = supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name");
    if (!can("attendance", true)) q = q.eq("supervisor_id", profile?.employee_id ?? "");
    return (await q).data ?? [];
  });
  const punch = async (id: string, type: "in" | "out") => {
    const pos = await new Promise<GeolocationPosition | null>((res) => navigator.geolocation?.getCurrentPosition(res, () => res(null), { timeout: 8000 }) ?? res(null));
    const { error } = await supabase.rpc("supervisor_punch", { p_employee: id, p_type: type, p_lat: pos?.coords.latitude ?? null, p_lng: pos?.coords.longitude ?? null });
    if (error) toast.error(error.message.includes("DUPLICATE") ? { message: "duplicate" } : error); else toast.ok(t("تم التسجيل", "Recorded"));
  };
  const rows = (workers.data ?? []) as any[];
  return <div className="card flush">{!rows.length ? <Empty /> : <table className="data"><tbody>{rows.map((w) => <tr key={w.id}>
    <td><Tx>{w.full_name}</Tx></td><td className="actions"><button className="sm primary" onClick={() => punch(w.id, "in")}>{t("حضور", "In")}</button>
      <button className="sm" onClick={() => punch(w.id, "out")}>{t("انصراف", "Out")}</button></td></tr>)}</tbody></table>}</div>;
}
