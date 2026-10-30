// Payroll: advances & fines are deducted and commissions added by the DB
// (generate_payroll). Every amount marked paid is spoken aloud; mute toggle
// is remembered on this device.
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf } from "../../lib/pdf";
import { CrudPage } from "../../components/CrudPage";
import { Empty, ErrorBox, Kpi, Tabs, useLoad, useToast } from "../../components/ui";

const empRef = { table: "employees", label: "full_name" };
const firstOfMonth = (m: string) => `${m}-01`;

function useMute() {
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem("mf-mute") === "1"; } catch { return false; } });
  const toggle = () => { const n = !muted; setMuted(n); try { localStorage.setItem("mf-mute", n ? "1" : "0"); } catch { /* ignore */ } };
  return { muted, toggle };
}

export function speakAmount(amount: number, name: string, lang: "ar" | "en") {
  if (!("speechSynthesis" in window)) return;
  const n = new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 2 }).format(amount);
  const u = new SpeechSynthesisUtterance(lang === "ar" ? `تم صرف ${n} ريال إلى ${name}` : `Paid ${n} riyals to ${name}`);
  u.lang = lang === "ar" ? "ar-SA" : "en-US";
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

export default function Payroll() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"run" | "establishment" | "advances" | "fines" | "commissions">("run");
  return (
    <>
      <div className="page-head"><h1>{t("الرواتب", "Payroll")}</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "run", label: t("مسير الرواتب", "Payroll run") },
        { id: "establishment", label: t("رواتب المنشأة", "Establishment payroll") },
        { id: "advances", label: t("السلف", "Advances") },
        { id: "fines", label: t("الغرامات", "Fines") },
        { id: "commissions", label: t("العمولات", "Commissions") },
      ]} />
      {tab === "run" && <Run />}
      {tab === "establishment" && <Establishment />}
      {tab === "advances" && <CrudPage table="advances" module="payroll" title={{ ar: "السلف", en: "Advances" }} orderBy={{ column: "deduct_month" }} totals={["amount"]}
        fields={[{ key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: empRef, required: true },
          { key: "amount", ar: "المبلغ", en: "Amount", type: "money", required: true },
          { key: "deduct_month", ar: "شهر الخصم (أول يوم)", en: "Deduct in month (1st)", type: "date", required: true },
          { key: "note", ar: "ملاحظة", en: "Note" }]} />}
      {tab === "fines" && <CrudPage table="fines" module="payroll" title={{ ar: "الغرامات", en: "Fines" }} orderBy={{ column: "month" }} totals={["amount"]}
        fields={[{ key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: empRef, required: true },
          { key: "amount", ar: "المبلغ", en: "Amount", type: "money", required: true },
          { key: "month", ar: "الشهر (أول يوم)", en: "Month (1st)", type: "date", required: true },
          { key: "reason", ar: "السبب", en: "Reason" }]} />}
      {tab === "commissions" && <CrudPage table="commissions" module="payroll" title={{ ar: "العمولات", en: "Commissions" }} orderBy={{ column: "month" }} totals={["amount"]}
        fields={[{ key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: empRef, required: true },
          { key: "amount", ar: "المبلغ", en: "Amount", type: "money", required: true },
          { key: "month", ar: "الشهر (أول يوم)", en: "Month (1st)", type: "date", required: true },
          { key: "source", ar: "المصدر", en: "Source" }]} />}
    </>
  );
}

function Run() {
  const { can } = useAuth();
  const { t, lang, fmtMoney } = useI18n();
  const toast = useToast();
  const { muted, toggle } = useMute();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const run = useLoad(async () => (await supabase.from("payroll_runs").select("*").eq("month", firstOfMonth(month)).maybeSingle()).data, [month]);
  const items = useLoad(async () => {
    if (!run.data) return [];
    return (await supabase.from("payroll_items").select("*, employees(full_name)").eq("run_id", (run.data as any).id).order("establishment")).data ?? [];
  }, [run.data]);
  const rows = (items.data ?? []) as any[];
  const r = run.data as any;
  const write = can("payroll", true);

  const generate = async () => {
    const { error } = await supabase.rpc("generate_payroll", { p_month: firstOfMonth(month) });
    if (error) toast.error(error); else { toast.ok(t("تم احتساب المسير", "Payroll calculated")); run.reload(); }
  };
  const pay = async (it: any) => {
    const { error } = await supabase.from("payroll_items").update({ paid: true, paid_at: new Date().toISOString() }).eq("id", it.id);
    if (error) return toast.error(error);
    if (!muted) speakAmount(Number(it.net), it.employees?.full_name ?? "", lang);
    items.reload();
  };
  const setStatus = async (status: string) => {
    const { error } = await supabase.from("payroll_runs").update({ status }).eq("id", r.id);
    if (error) toast.error(error); else run.reload();
  };
  const sum = (k: string) => rows.reduce((s, x) => s + Number(x[k]), 0);
  const cols = [
    { k: "basic", ar: "الأساسي", en: "Basic" }, { k: "allowances", ar: "البدلات", en: "Allowances" },
    { k: "commissions", ar: "العمولات +", en: "Commissions +" }, { k: "advances", ar: "السلف −", en: "Advances −" },
    { k: "fines", ar: "الغرامات −", en: "Fines −" }, { k: "net", ar: "الصافي", en: "Net" },
  ];
  const pdf = () => exportPdf({
    title: t("مسير الرواتب", "Payroll"), subtitle: month, lang, filename: `payroll-${month}`,
    sections: [{
      columns: [{ header: t("الموظف", "Employee"), value: (x) => (x as any).employees?.full_name },
        { header: t("المنشأة", "Establishment"), value: (x) => (x as any).establishment },
        ...cols.map((c) => ({ header: lang === "ar" ? c.ar : c.en, value: (x: any) => fmtMoney(x[c.k]) })),
        { header: t("مصروف", "Paid"), value: (x) => ((x as any).paid ? "✓" : "") }],
      rows, totals: [t("الإجمالي", "Total"), "", ...cols.map((c) => fmtMoney(sum(c.k))), ""],
    }],
  });

  return (
    <div className="card flush">
      <div className="card-head" style={{ padding: 12, margin: 0 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} />
        {r && <span className={`badge ${r.status === "paid" ? "ok" : r.status === "approved" ? "info" : "warn"}`}>{r.status}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={toggle} title={t("نطق المبالغ", "Speak amounts")}>{muted ? "🔇" : "🔊"}</button>
        {write && (!r || r.status === "draft") && <button className="primary" onClick={generate}>⟳ {t("احتساب المسير", "Calculate")}</button>}
        {write && r?.status === "draft" && <button onClick={() => setStatus("approved")}>{t("اعتماد", "Approve")}</button>}
        {write && r?.status === "approved" && rows.every((x) => x.paid) && <button onClick={() => setStatus("paid")}>{t("إقفال كمصروف", "Close as paid")}</button>}
        <button onClick={pdf} disabled={!rows.length}>⬇ PDF</button>
      </div>
      <ErrorBox error={run.error || items.error} />
      {rows.length ? <>
        <div className="kpis" style={{ padding: 12 }}>
          <Kpi label={t("الموظفون", "Employees")} value={rows.length} />
          <Kpi label={t("إجمالي الصافي", "Total net")} value={fmtMoney(sum("net"))} tone="accent" />
          <Kpi label={t("المصروف", "Paid")} value={fmtMoney(rows.filter((x) => x.paid).reduce((s, x) => s + Number(x.net), 0))} />
        </div>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>{t("الموظف", "Employee")}</th><th>{t("المنشأة", "Establishment")}</th>{cols.map((c) => <th key={c.k}>{lang === "ar" ? c.ar : c.en}</th>)}<th /></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.id}><td><Tx>{x.employees?.full_name}</Tx></td><td><Tx>{x.establishment}</Tx></td>
            {cols.map((c) => <td key={c.k} className="num">{fmtMoney(x[c.k])}</td>)}
            <td className="actions">{x.paid ? <span className="badge ok">✓ {t("مصروف", "Paid")}</span>
              : write && r?.status === "approved" && <button className="sm primary" onClick={() => pay(x)}>{t("صرف", "Pay")}</button>}</td></tr>)}</tbody>
          <tfoot><tr><td>{t("الإجمالي", "Total")}</td><td />{cols.map((c) => <td key={c.k} className="num">{fmtMoney(sum(c.k))}</td>)}<td /></tr></tfoot>
        </table></div>
      </> : <Empty>{t("لم يُحتسب مسير لهذا الشهر بعد", "No payroll calculated for this month yet")}</Empty>}
    </div>
  );
}

function Establishment() {
  return <CrudPage table="establishment_payroll" module="payroll" canWrite={false} title={{ ar: "رواتب المنشأة", en: "Establishment payroll" }}
    orderBy={{ column: "month" }} totals={["employees", "basic", "allowances", "commissions", "advances", "fines", "net", "paid"]} fields={[
      { key: "month", ar: "الشهر", en: "Month", type: "date" },
      { key: "establishment", ar: "المنشأة", en: "Establishment" },
      { key: "employees", ar: "عدد الموظفين", en: "Employees", type: "number" },
      { key: "basic", ar: "الأساسي", en: "Basic", type: "money" },
      { key: "allowances", ar: "البدلات", en: "Allowances", type: "money" },
      { key: "commissions", ar: "العمولات", en: "Commissions", type: "money" },
      { key: "advances", ar: "السلف", en: "Advances", type: "money" },
      { key: "fines", ar: "الغرامات", en: "Fines", type: "money" },
      { key: "net", ar: "الصافي", en: "Net", type: "money" },
      { key: "paid", ar: "المصروف", en: "Paid", type: "money" },
    ]} />;
}
