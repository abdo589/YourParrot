// Sales: quote requests with approval stages, 2% commission on the pre-VAT
// value (frozen after "won" by the DB), email-to-client beside the view
// icon, client meetings with a notified owner, and activity reports.
import { useState } from "react";
import { callFn, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n, todayISO } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf, pdfBase64, type PdfOptions } from "../../lib/pdf";
import { CrudPage, type Row } from "../../components/CrudPage";
import { Empty, Kpi, Modal, Tabs, useLoad, useToast } from "../../components/ui";

export const STAGES = [
  { value: "new", ar: "جديد", en: "New", tone: "" },
  { value: "pricing", ar: "تسعير", en: "Pricing", tone: "info" },
  { value: "manager_review", ar: "مراجعة المدير", en: "Manager review", tone: "info" },
  { value: "ceo_approval", ar: "اعتماد الرئيس التنفيذي", en: "CEO approval", tone: "warn" },
  { value: "sent", ar: "أُرسل للعميل", en: "Sent to client", tone: "info" },
  { value: "negotiation", ar: "تفاوض", en: "Negotiation", tone: "warn" },
  { value: "won", ar: "فاز", en: "Won", tone: "ok" },
  { value: "lost", ar: "خسر", en: "Lost", tone: "danger" },
];

export default function Sales() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"quotes" | "meetings" | "reports">(
    (new URLSearchParams(location.search).get("tab") as "meetings") ?? "quotes");
  return (
    <>
      <div className="page-head"><h1>{t("المبيعات", "Sales")}</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "quotes", label: t("طلبات التسعير", "Quote requests") },
        { id: "meetings", label: t("الاجتماعات", "Meetings") },
        { id: "reports", label: t("التقارير", "Reports") },
      ]} />
      {tab === "quotes" && <Quotes />}
      {tab === "meetings" && <Meetings />}
      {tab === "reports" && <Reports />}
    </>
  );
}

function quotePdf(q: Row, t: (a: string, b: string) => string, lang: "ar" | "en", fmtMoney: (n: number) => string, fmtDate: (d: string) => string): PdfOptions {
  return {
    title: `${t("عرض سعر", "Quotation")} ${q.ref_no}`, subtitle: q.client_name, lang, orientation: "portrait", filename: q.ref_no,
    facts: [
      [t("العميل", "Client"), q.client_name], [t("المشروع", "Project"), q.project_title],
      [t("الوصف", "Description"), q.description ?? ""], [t("التاريخ", "Date"), fmtDate(q.created_at)],
      [t("القيمة قبل الضريبة", "Value before VAT"), fmtMoney(q.value_pre_vat)],
      [t(`ضريبة القيمة المضافة ${q.vat_rate}%`, `VAT ${q.vat_rate}%`), fmtMoney(q.value_with_vat - q.value_pre_vat)],
      [t("الإجمالي شامل الضريبة", "Total incl. VAT"), fmtMoney(q.value_with_vat)],
    ],
    sections: [],
  };
}

function Quotes() {
  const { t, lang, fmtMoney, fmtDate } = useI18n();
  const { can } = useAuth();
  const [emailing, setEmailing] = useState<Row | null>(null);
  return (
    <>
      <CrudPage table="quote_requests" module={can("sales", true) ? "sales" : "sales_all"} title={{ ar: "طلبات التسعير", en: "Quote requests" }}
        orderBy={{ column: "created_at" }} totals={["value_pre_vat", "commission"]} defaults={{ stage: "new", vat_rate: 15 }} allowDelete={false}
        rowActions={(r) => <>
          <button className="ghost icon" title={t("إرسال بالبريد للعميل", "Email to client")} onClick={() => setEmailing(r)}>✉</button>
          <button className="ghost icon" title="PDF" onClick={() => exportPdf(quotePdf(r, t, lang, fmtMoney, fmtDate))}>⬇</button>
        </>}
        fields={[
          { key: "ref_no", ar: "المرجع", en: "Ref", readOnly: true },
          { key: "client_name", ar: "العميل", en: "Client", required: true },
          { key: "client_email", ar: "بريد العميل", en: "Client email", type: "email", hideInTable: true },
          { key: "client_phone", ar: "جوال العميل", en: "Client phone", hideInTable: true },
          { key: "project_title", ar: "المشروع", en: "Project", required: true },
          { key: "sector", ar: "القطاع", en: "Sector", type: "lookup", lookup: "sector", hideInTable: true },
          { key: "description", ar: "الوصف", en: "Description", type: "textarea", hideInTable: true },
          { key: "stage", ar: "المرحلة", en: "Stage", type: "select", options: STAGES, required: true },
          { key: "value_pre_vat", ar: "القيمة قبل الضريبة", en: "Value (pre-VAT)", type: "money" },
          { key: "vat_rate", ar: "الضريبة %", en: "VAT %", type: "percent", hideInTable: true },
          { key: "value_with_vat", ar: "شامل الضريبة", en: "Incl. VAT", type: "money", readOnly: true },
          { key: "commission", ar: "العمولة 2%", en: "Commission 2%", type: "money", readOnly: true },
          { key: "due_date", ar: "تاريخ الاستحقاق", en: "Due", type: "date", hideInTable: true },
          { key: "lost_reason", ar: "سبب الخسارة", en: "Lost reason", hideInTable: true },
          ...(can("sales_all") ? [{ key: "owner_id", ar: "المسؤول", en: "Owner", type: "ref" as const, readOnly: true, ref: { table: "directory", label: "full_name" } }] : []),
        ]} />
      {emailing && <EmailQuote quote={emailing} onClose={() => setEmailing(null)} />}
    </>
  );
}

function EmailQuote({ quote, onClose }: { quote: Row; onClose: () => void }) {
  const { t, lang, fmtMoney, fmtDate } = useI18n();
  const toast = useToast();
  const [to, setTo] = useState(quote.client_email ?? "");
  const [subject, setSubject] = useState(`${t("عرض سعر", "Quotation")} ${quote.ref_no} — ${quote.project_title}`);
  const [message, setMessage] = useState(t(`السادة ${quote.client_name}،\n\nنرفق لكم عرض السعر الخاص بمشروع ${quote.project_title}.\n\nمع التحية،\nMetal Fuze`,
    `Dear ${quote.client_name},\n\nPlease find attached our quotation for ${quote.project_title}.\n\nBest regards,\nMetal Fuze`));
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const pdf_base64 = await pdfBase64(quotePdf(quote, t, lang, fmtMoney, fmtDate));
      await callFn("send-email", { quote_id: quote.id, to, subject, message, pdf_base64 });
      toast.ok(t("تم الإرسال للعميل", "Sent to client")); onClose();
    } catch (e) { toast.error(e); }
    setBusy(false);
  };
  return (
    <Modal title={t("إرسال عرض السعر بالبريد", "Email quotation")} onClose={onClose}
      footer={<button className="primary" disabled={busy || !to} onClick={send}>{busy ? "…" : t("إرسال", "Send")}</button>}>
      <div className="form-grid">
        <label className="field">{t("إلى", "To")}<input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field">{t("الموضوع", "Subject")}<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="field wide">{t("الرسالة", "Message")}<textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      </div>
      <p className="muted">📎 {quote.ref_no}.pdf</p>
    </Modal>
  );
}

function Meetings() {
  const { can } = useAuth();
  return <CrudPage table="sales_meetings" module={can("sales", true) ? "sales" : "sales_all"} title={{ ar: "اجتماعات العملاء", en: "Client meetings" }}
    orderBy={{ column: "meeting_at" }} fields={[
      { key: "client_name", ar: "العميل", en: "Client", required: true },
      { key: "meeting_at", ar: "الموعد", en: "When", type: "datetime", required: true },
      { key: "location", ar: "المكان", en: "Location" },
      { key: "responsible_id", ar: "المسؤول (هيثم / الرئيس التنفيذي / إيلاف)", en: "Responsible (Haitham / CEO / Eilaf)", type: "ref", required: true,
        ref: { table: "directory", label: "full_name", filter: (q: any) => q.eq("is_meeting_responsible", true) } },
      { key: "quote_id", ar: "طلب التسعير", en: "Quote", type: "ref", ref: { table: "quote_requests", label: "ref_no" }, hideInTable: true },
      { key: "agenda", ar: "جدول الأعمال", en: "Agenda", type: "textarea" },
      { key: "outcome", ar: "النتيجة", en: "Outcome", type: "textarea" },
    ]} />;
}

function Reports() {
  const { t, lang, fmtMoney, fmtDate, fmtDateTime } = useI18n();
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const { data } = useLoad(async () => {
    const end = `${to}T23:59:59+03:00`, start = `${from}T00:00:00+03:00`;
    const [created, history, meetings] = await Promise.all([
      supabase.from("quote_requests").select("*").gte("created_at", start).lte("created_at", end).order("created_at"),
      supabase.from("quote_stage_history").select("*, quote_requests(ref_no, client_name, project_title)").gte("at", start).lte("at", end).order("at"),
      supabase.from("sales_meetings").select("*").gte("meeting_at", start).lte("meeting_at", end).order("meeting_at"),
    ]);
    return { created: created.data ?? [], history: history.data ?? [], meetings: meetings.data ?? [] };
  }, [from, to]);
  const stage = (v: string) => { const s = STAGES.find((x) => x.value === v); return s ? (lang === "ar" ? s.ar : s.en) : v ?? ""; };
  const won = (data?.history ?? []).filter((h: any) => h.to_stage === "won");
  const created = (data?.created ?? []) as any[];
  const pdf = () => exportPdf({
    title: t("تقرير نشاط المبيعات", "Sales activity report"), subtitle: `${fmtDate(from)} — ${fmtDate(to)}`, lang, filename: `sales-${from}-${to}`,
    facts: [[t("طلبات جديدة", "New quotes"), String(created.length)], [t("صفقات فائزة", "Won"), String(won.length)],
      [t("قيمة الطلبات الجديدة", "New quotes value"), fmtMoney(created.reduce((s, q) => s + Number(q.value_pre_vat), 0))],
      [t("الاجتماعات", "Meetings"), String(data?.meetings.length ?? 0)]],
    sections: [
      { heading: t("الطلبات الجديدة", "New quotes"), rows: created, columns: [
        { header: t("المرجع", "Ref"), value: (r) => r.ref_no as string }, { header: t("العميل", "Client"), value: (r) => r.client_name as string },
        { header: t("المشروع", "Project"), value: (r) => r.project_title as string }, { header: t("المرحلة", "Stage"), value: (r) => stage(r.stage as string) },
        { header: t("القيمة", "Value"), value: (r) => fmtMoney(r.value_pre_vat as number) }] },
      { heading: t("تغييرات المراحل", "Stage changes"), rows: data?.history ?? [], columns: [
        { header: t("الوقت", "Time"), value: (r) => fmtDateTime(r.at as string) }, { header: t("المرجع", "Ref"), value: (r: any) => r.quote_requests?.ref_no },
        { header: t("العميل", "Client"), value: (r: any) => r.quote_requests?.client_name },
        { header: t("من", "From"), value: (r) => stage(r.from_stage as string) }, { header: t("إلى", "To"), value: (r) => stage(r.to_stage as string) }] },
      { heading: t("الاجتماعات", "Meetings"), rows: data?.meetings ?? [], columns: [
        { header: t("الموعد", "When"), value: (r) => fmtDateTime(r.meeting_at as string) }, { header: t("العميل", "Client"), value: (r) => r.client_name as string },
        { header: t("المكان", "Location"), value: (r) => r.location as string }, { header: t("النتيجة", "Outcome"), value: (r) => r.outcome as string }] },
    ],
  });
  return (
    <div className="card">
      <div className="card-head"><h2>{t("تقرير تلقائي لكل ما تم في الفترة", "Automatic report of everything in the period")}</h2>
        <div className="toolbar"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
          <button className="primary" onClick={pdf}>⬇ PDF</button></div></div>
      {data && <div className="kpis">
        <Kpi label={t("طلبات جديدة", "New quotes")} value={created.length} />
        <Kpi label={t("صفقات فائزة", "Won")} value={won.length} tone="accent" />
        <Kpi label={t("تغييرات المراحل", "Stage changes")} value={data.history.length} />
        <Kpi label={t("الاجتماعات", "Meetings")} value={data.meetings.length} />
      </div>}
      <h3 style={{ marginTop: 16 }}>{t("تغييرات المراحل", "Stage changes")}</h3>
      {!data?.history.length ? <Empty /> : <table className="data"><tbody>{data.history.map((h: any) => <tr key={h.id}>
        <td>{fmtDateTime(h.at)}</td><td>{h.quote_requests?.ref_no}</td><td><Tx>{h.quote_requests?.client_name}</Tx></td>
        <td>{stage(h.from_stage)} → <b>{stage(h.to_stage)}</b></td></tr>)}</tbody></table>}
    </div>
  );
}
