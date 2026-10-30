// One construction project: contract, team & org chart, submissions,
// invoices, planning (Gantt), daily/weekly/monthly reports and members.
// Per-project roles (project_members) are enforced by RLS.
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { signedUrl, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n, todayISO } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf } from "../../lib/pdf";
import { CrudPage, type Row } from "../../components/CrudPage";
import { SelectOther, useLookup } from "../../components/SelectOther";
import { Empty, ErrorBox, Kpi, Modal, Progress, Tabs, must, useLoad, useToast } from "../../components/ui";
import { monthRange, weekRange } from "../projects/ProjectReports";
import { CODES, CP_ROLES, CP_STATUS, INVOICE_STATUS, JOB_TITLES, SUB_TYPES } from "./shared";

type Tab = "contract" | "team" | "documents" | "invoices" | "planning" | "daily" | "reports" | "members";

export default function CpProject() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>((new URLSearchParams(location.search).get("tab") as Tab) ?? "contract");
  const p = useLoad(async () => must(await supabase.from("cp_projects").select("*").eq("id", id!).single()), [id]);
  const pr = p.data as Row | null;
  const st = CP_STATUS.find((s) => s.value === pr?.status);
  return (
    <>
      <ErrorBox error={p.error} />
      {pr && <>
        <div className="page-head"><h1>{pr.code} — <Tx>{pr.name}</Tx></h1>
          {st && <span className={`badge ${st.tone}`}>{lang === "ar" ? st.ar : st.en}</span>}
          <span className="muted"><Tx>{pr.client}</Tx> · <Tx>{pr.location}</Tx></span></div>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "contract", label: t("العقد", "Contract") }, { id: "team", label: t("فريق العمل", "Team") },
          { id: "documents", label: t("المستندات", "Documents") }, { id: "invoices", label: t("المستخلصات", "Invoices") },
          { id: "planning", label: t("التخطيط", "Planning") }, { id: "daily", label: t("التقرير اليومي", "Daily reports") },
          { id: "reports", label: t("التقارير الدورية", "Periodic reports") }, { id: "members", label: t("الأعضاء والصلاحيات", "Members & roles") },
        ]} />
        {tab === "contract" && <Contract project={pr} />}
        {tab === "team" && <Team projectId={pr.id} />}
        {tab === "documents" && <Documents project={pr} />}
        {tab === "invoices" && <Invoices project={pr} />}
        {tab === "planning" && <Planning project={pr} />}
        {tab === "daily" && <Daily project={pr} />}
        {tab === "reports" && <Periodic project={pr} />}
        {tab === "members" && <Members projectId={pr.id} />}
      </>}
    </>
  );
}

// ------------------------------------------------------------------ files
function Files({ projectId, category, refId, title }: { projectId: string; category: string; refId?: string; title: string }) {
  const { t, fmtDateTime } = useI18n();
  const toast = useToast();
  const files = useLoad(async () => {
    let q = supabase.from("cp_files").select("*").eq("project_id", projectId).eq("category", category).order("uploaded_at", { ascending: false });
    if (refId) q = q.eq("ref_id", refId);
    return (await q).data ?? [];
  }, [projectId, category, refId]);
  const upload = async (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      const path = `${projectId}/${category}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("construction").upload(path, f);
      if (up.error) { toast.error(up.error); continue; }
      const { error } = await supabase.from("cp_files").insert({ project_id: projectId, category, ref_id: refId ?? null, file_path: path, file_name: f.name });
      if (error) toast.error(error);
    }
    files.reload();
  };
  const open = async (path: string) => { try { window.open(await signedUrl("construction", path, 300), "_blank", "noopener"); } catch (e) { toast.error(e); } };
  return (
    <div>
      <div className="card-head"><h3 style={{ flex: 1 }}>{title}</h3>
        <label className="btn sm">⬆ {t("رفع", "Upload")}<input type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label></div>
      {!(files.data as Row[])?.length ? <small className="muted">{t("لا توجد ملفات", "No files")}</small> :
        <table className="data"><tbody>{(files.data as Row[]).map((f) => <tr key={f.id}><td>{f.file_name}</td><td className="muted">{fmtDateTime(f.uploaded_at)}</td>
          <td className="actions"><button className="sm" onClick={() => open(f.file_path)}>{t("فتح", "Open")}</button></td></tr>)}</tbody></table>}
    </div>
  );
}

// --------------------------------------------------------------- contract
function Contract({ project }: { project: Row }) {
  const { t, fmtMoney, fmtDate } = useI18n();
  const toast = useToast();
  const c = useLoad(async () => (await supabase.from("cp_contracts").select("*").eq("project_id", project.id).maybeSingle()).data ?? { project_id: project.id }, [project.id]);
  const totals = useLoad(async () => (await supabase.from("cp_project_totals").select("*").eq("project_id", project.id).maybeSingle()).data, [project.id]);
  const [edit, setEdit] = useState<Row | null>(null);
  const save = async () => {
    const { project_id, contract_no, value, signing_date, duration_days, consultant, pmo, notes } = edit!;
    const { error } = await supabase.from("cp_contracts").upsert({ project_id, contract_no, value, signing_date, duration_days, consultant, pmo, notes });
    if (error) toast.error(error); else { setEdit(null); c.reload(); totals.reload(); }
  };
  const k = c.data as Row | null;
  const tt = totals.data as Row | null;
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEdit({ ...edit!, [key]: e.target.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null });
  return (
    <>
      {tt && <div className="kpis">
        <Kpi label={t("قيمة العقد", "Contract value")} value={fmtMoney(tt.contract_value)} tone="accent" />
        <Kpi label={t("إجمالي المستخلصات", "Invoiced")} value={fmtMoney(tt.invoiced)} />
        <Kpi label={t("المدفوع", "Paid")} value={fmtMoney(tt.paid)} />
        <Kpi label={t("المتبقي", "Remaining")} value={fmtMoney(tt.remaining)} tone="danger" />
      </div>}
      <div className="card">
        <div className="card-head"><h2>{t("بيانات العقد", "Contract details")}</h2><button onClick={() => setEdit({ ...k })}>✎ {t("تعديل", "Edit")}</button></div>
        {k && <div className="form-grid">
          {([["contract_no", t("رقم العقد", "Contract #")], ["value", t("القيمة", "Value")], ["signing_date", t("تاريخ التوقيع", "Signed")],
            ["duration_days", t("المدة (يوم)", "Duration (days)")], ["consultant", t("الاستشاري", "Consultant")], ["pmo", "PMO"]] as const).map(([key, label]) =>
            <div key={key}><small className="muted">{label}</small><div>{key === "value" ? fmtMoney(k[key]) : key === "signing_date" ? fmtDate(k[key]) : <Tx>{k[key] != null ? String(k[key]) : "—"}</Tx>}</div></div>)}
        </div>}
      </div>
      <div className="cols-2">
        <div className="card"><Files projectId={project.id} category="contract" title={t("مرفقات العقد", "Contract attachments")} /></div>
        <div className="card"><Files projectId={project.id} category="specs" title={t("المواصفات", "Specifications")} /></div>
        <div className="card"><Files projectId={project.id} category="tender_drawings" title={t("مخططات المناقصة", "Tender drawings")} /></div>
      </div>
      {edit && <Modal title={t("بيانات العقد", "Contract details")} onClose={() => setEdit(null)} footer={<button className="primary" onClick={save}>{t("حفظ", "Save")}</button>}>
        <div className="form-grid">
          <label className="field">{t("رقم العقد", "Contract #")}<input value={edit.contract_no ?? ""} onChange={set("contract_no")} /></label>
          <label className="field">{t("القيمة", "Value")}<input type="number" value={edit.value ?? ""} onChange={set("value")} /></label>
          <label className="field">{t("تاريخ التوقيع", "Signing date")}<input type="date" value={edit.signing_date ?? ""} onChange={set("signing_date")} /></label>
          <label className="field">{t("المدة (يوم)", "Duration (days)")}<input type="number" value={edit.duration_days ?? ""} onChange={set("duration_days")} /></label>
          <label className="field">{t("الاستشاري", "Consultant")}<input value={edit.consultant ?? ""} onChange={set("consultant")} /></label>
          <label className="field">PMO<input value={edit.pmo ?? ""} onChange={set("pmo")} /></label>
          <label className="field wide">{t("ملاحظات", "Notes")}<textarea value={edit.notes ?? ""} onChange={set("notes")} /></label>
        </div></Modal>}
    </>
  );
}

// ------------------------------------------------------------------- team
function Team({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState<"tree" | "table">("tree");
  const [k, setK] = useState(0);
  const team = useLoad(async () => (await supabase.from("cp_team").select("*").eq("project_id", projectId).order("created_at")).data ?? [], [projectId, k]);
  const title = (v: string) => { const j = JOB_TITLES.find((x) => x.value === v); return j ? (lang === "ar" ? j.ar : j.en) : v; };
  const rows = (team.data ?? []) as Row[];
  const Node = ({ m }: { m: Row }) => {
    const kids = rows.filter((r) => r.manager_id === m.id);
    return <li><span className="node"><b><Tx>{m.full_name}</Tx></b><small>{title(m.job_title)}</small></span>
      {kids.length > 0 && <ul>{kids.map((c) => <Node key={c.id} m={c} />)}</ul>}</li>;
  };
  const roots = rows.filter((r) => !r.manager_id || !rows.some((x) => x.id === r.manager_id));
  return (
    <>
      <Tabs value={view} onChange={setView} tabs={[{ id: "tree", label: t("الهيكل التنظيمي", "Org chart") }, { id: "table", label: t("جدول", "Table") }]} />
      {view === "tree" ? <div className="card org">{rows.length ? <ul>{roots.map((r) => <Node key={r.id} m={r} />)}</ul> : <Empty />}</div> :
        <CrudPage key={k} table="cp_team" module="construction" canWrite title={{ ar: "فريق العمل", en: "Team" }}
          filter={(q) => q.eq("project_id", projectId)} filterKey={projectId} defaults={{ project_id: projectId }}
          onSaved={() => setK(k + 1)} orderBy={{ column: "created_at", ascending: true }}
          fields={[
            { key: "project_id", ar: "", en: "", hideInForm: true, hideInTable: true },
            { key: "full_name", ar: "الاسم", en: "Name", required: true },
            { key: "job_title", ar: "الوظيفة", en: "Job title", type: "select", options: JOB_TITLES, required: true },
            { key: "manager_id", ar: "المسؤول المباشر", en: "Direct manager", type: "ref",
              ref: { table: "cp_team", label: "full_name", filter: (q: any) => q.eq("project_id", projectId) } },
            { key: "phone", ar: "الجوال", en: "Phone" },
            { key: "email", ar: "البريد", en: "Email", type: "email" },
          ]} />}
    </>
  );
}

// -------------------------------------------------------------- documents
function Documents({ project }: { project: Row }) {
  const { t, lang, fmtDate } = useI18n();
  const toast = useToast();
  const [type, setType] = useState("");
  const [k, setK] = useState(0);
  const [filesFor, setFilesFor] = useState<Row | null>(null);
  const setCode = async (r: Row, code: string) => {
    const { error } = await supabase.from("submissions").update({ code: code || null }).eq("id", r.id);
    if (error) toast.error(error); else setK(k + 1);
  };
  const resubmit = async (r: Row) => {
    const { error } = await supabase.from("submissions").insert({ parent_id: r.id, project_id: r.project_id, type: r.type, title: r.title,
      description: r.description, discipline: r.discipline, location: r.location });
    if (error) toast.error(error); else { toast.ok(t("تم إنشاء مراجعة جديدة", "New revision created")); setK(k + 1); }
  };
  return (
    <>
      <div className="toolbar"><select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 240 }}>
        <option value="">{t("كل الأنواع", "All types")}</option>{SUB_TYPES.map((s) => <option key={s.value} value={s.value}>{lang === "ar" ? s.ar : s.en}</option>)}</select></div>
      <CrudPage key={`${k}-${type}`} table="submissions" view="submissions_view" module="construction" canWrite
        title={{ ar: "المستندات", en: "Submissions" }} orderBy={{ column: "created_at" }} allowDelete={false}
        filter={(q) => { q = q.eq("project_id", project.id); return type ? q.eq("type", type) : q; }} filterKey={project.id + type}
        defaults={() => ({ project_id: project.id, type: type || "WIR", submitted_on: todayISO() })}
        rowActions={(r) => <>
          <select className="sm" style={{ width: 70, padding: "2px 4px" }} value={r.code ?? ""} onChange={(e) => setCode(r, e.target.value)} disabled={r.superseded}>
            <option value="">—</option>{CODES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}</select>
          {(r.code === "C" || r.code === "D") && !r.superseded && <button className="sm" onClick={() => resubmit(r)}>↻ {t("إعادة تقديم", "Resubmit")}</button>}
          <button className="ghost icon" title={t("مرفقات", "Attachments")} onClick={() => setFilesFor(r)}>📎</button>
        </>}
        fields={[
          { key: "project_id", ar: "", en: "", hideInForm: true, hideInTable: true },
          { key: "ref_no", ar: "المرجع", en: "Reference", readOnly: true, render: (r) => <>{r.ref_no}{r.superseded && <small className="muted"> ({t("مُستبدل", "superseded")})</small>}</> },
          { key: "type", ar: "النوع", en: "Type", type: "select", options: SUB_TYPES, required: true },
          { key: "title", ar: "العنوان", en: "Title", required: true },
          { key: "discipline", ar: "التخصص", en: "Discipline", type: "lookup", lookup: "discipline" },
          { key: "location", ar: "الموقع", en: "Location", hideInTable: true },
          { key: "description", ar: "الوصف", en: "Description", type: "textarea", hideInTable: true },
          { key: "submitted_on", ar: "تاريخ التقديم", en: "Submitted", type: "date", required: true },
          { key: "returned_on", ar: "تاريخ الرد", en: "Returned", type: "date", readOnly: true },
          { key: "code", ar: "الكود", en: "Code", type: "select", options: CODES, readOnly: true,
            render: (r) => r.code ? <span className={`badge code-${r.code}`}>{r.code}</span> : <span className="badge">{t("بانتظار", "Pending")}</span> },
          { key: "waiting_days", ar: "أيام الانتظار", en: "Waiting days", type: "number", readOnly: true,
            render: (r) => r.waiting_days == null ? "" : <span className={r.waiting_days > 7 ? "red" : ""}>{r.waiting_days}</span> },
        ]} />
      {filesFor && <Modal title={`${filesFor.ref_no} — ${t("المرفقات", "Attachments")}`} onClose={() => setFilesFor(null)}>
        <Files projectId={project.id} category="submission" refId={filesFor.id} title={fmtDate(filesFor.submitted_on)} /></Modal>}
    </>
  );
}

// --------------------------------------------------------------- invoices
function Invoices({ project }: { project: Row }) {
  const { t, lang, fmtMoney, fmtDate, fmtDateTime } = useI18n();
  const toast = useToast();
  const [k, setK] = useState(0);
  const [open, setOpen] = useState<Row | null>(null);
  const totals = useLoad(async () => (await supabase.from("cp_project_totals").select("*").eq("project_id", project.id).maybeSingle()).data, [project.id, k]);
  const tt = totals.data as Row | null;
  return (
    <>
      {tt && <div className="kpis">
        <Kpi label={t("قيمة العقد", "Contract")} value={fmtMoney(tt.contract_value)} tone="accent" />
        <Kpi label={t("إجمالي المستخلصات", "Invoiced")} value={fmtMoney(tt.invoiced)} />
        <Kpi label={t("المدفوع", "Paid")} value={fmtMoney(tt.paid)} />
        <Kpi label={t("المتبقي", "Remaining")} value={fmtMoney(tt.remaining)} tone="danger" />
      </div>}
      <CrudPage key={k} table="cp_invoices" view="cp_invoices_view" module="construction" canWrite title={{ ar: "المستخلصات", en: "Invoices" }}
        filter={(q) => q.eq("project_id", project.id)} filterKey={project.id} orderBy={{ column: "invoice_no" }} allowDelete={false}
        defaults={{ project_id: project.id, retention_pct: 10, status: "draft" }} onSaved={() => setK(k + 1)}
        totals={["gross_amount", "retention_amount", "net_amount", "paid_amount"]}
        rowActions={(r) => <button className="sm primary" onClick={() => setOpen(r)}>{t("البنود والمتابعة", "Items & follow-up")}</button>}
        fields={[
          { key: "project_id", ar: "", en: "", hideInForm: true, hideInTable: true },
          { key: "invoice_no", ar: "رقم المستخلص", en: "Invoice #", readOnly: true },
          { key: "period_from", ar: "من", en: "From", type: "date", required: true },
          { key: "period_to", ar: "إلى", en: "To", type: "date", required: true },
          { key: "gross_amount", ar: "الإجمالي", en: "Gross", type: "money", readOnly: true },
          { key: "retention_pct", ar: "نسبة المحتجز", en: "Retention %", type: "percent" },
          { key: "retention_amount", ar: "المحتجز", en: "Retention", type: "money", readOnly: true },
          { key: "net_amount", ar: "الصافي", en: "Net", type: "money", readOnly: true },
          { key: "status", ar: "الحالة", en: "Status", type: "select", options: INVOICE_STATUS, required: true },
          { key: "submitted_on", ar: "تاريخ التقديم", en: "Submitted", type: "date" },
          { key: "paid_amount", ar: "المبلغ المصروف", en: "Paid amount", type: "money" },
          { key: "days_unpaid", ar: "أيام بدون صرف", en: "Days unpaid", type: "number", readOnly: true,
            render: (r) => r.days_unpaid == null ? "" : <span className={r.overdue ? "red" : ""}>{r.days_unpaid}{r.overdue && " ⚠"}</span> },
          { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
        ]} />
      {open && <InvoiceItems invoice={open} onClose={() => { setOpen(null); setK(k + 1); }} />}
    </>
  );

  function InvoiceItems({ invoice, onClose }: { invoice: Row; onClose: () => void }) {
    const [note, setNote] = useState("");
    const [pick, setPick] = useState({ submission_id: "", amount: "" });
    const items = useLoad(async () => (await supabase.from("cp_invoice_items").select("*, submissions(ref_no, title, code)").eq("invoice_id", invoice.id)).data ?? [], [invoice.id]);
    const wirs = useLoad(async () => (await supabase.from("submissions").select("id, ref_no, title, code").eq("project_id", project.id)
      .eq("type", "WIR").in("code", ["A", "B"]).order("ref_no")).data ?? [], []);
    const notes = useLoad(async () => (await supabase.from("cp_invoice_followups").select("*").eq("invoice_id", invoice.id).order("at", { ascending: false })).data ?? [], [invoice.id]);
    const add = async () => {
      const { error } = await supabase.from("cp_invoice_items").insert({ invoice_id: invoice.id, submission_id: pick.submission_id, amount: Number(pick.amount) });
      if (error) toast.error(error); else { setPick({ submission_id: "", amount: "" }); items.reload(); }
    };
    const del = async (id: string) => { const { error } = await supabase.from("cp_invoice_items").delete().eq("id", id); if (error) toast.error(error); else items.reload(); };
    const addNote = async () => {
      const { error } = await supabase.from("cp_invoice_followups").insert({ invoice_id: invoice.id, note });
      if (error) toast.error(error); else { setNote(""); notes.reload(); }
    };
    const rows = (items.data ?? []) as Row[];
    const used = new Set(rows.map((r) => r.submission_id));
    const gross = rows.reduce((s, r) => s + Number(r.amount), 0);
    const ret = Math.round(gross * Number(invoice.retention_pct)) / 100;
    const pdf = () => exportPdf({
      title: `${t("مستخلص رقم", "Invoice no.")} ${invoice.invoice_no}`, subtitle: `${project.code} — ${project.name}`, lang, orientation: "portrait",
      filename: `${project.code}-invoice-${invoice.invoice_no}`,
      facts: [[t("الفترة", "Period"), `${fmtDate(invoice.period_from)} — ${fmtDate(invoice.period_to)}`],
        [t("الإجمالي", "Gross"), fmtMoney(gross)], [`${t("المحتجز", "Retention")} ${invoice.retention_pct}%`, fmtMoney(ret)], [t("الصافي", "Net"), fmtMoney(gross - ret)]],
      sections: [{ columns: [{ header: "WIR", value: (r: any) => r.submissions?.ref_no }, { header: t("البند", "Item"), value: (r: any) => r.description ?? r.submissions?.title },
        { header: t("الكود", "Code"), value: (r: any) => r.submissions?.code }, { header: t("المبلغ", "Amount"), value: (r) => fmtMoney(r.amount as number) }],
        rows, totals: [t("الإجمالي", "Total"), "", "", fmtMoney(gross)] }],
    });
    return (
      <Modal wide title={`${t("مستخلص رقم", "Invoice")} ${invoice.invoice_no}`} onClose={onClose} footer={<button onClick={pdf}>⬇ PDF</button>}>
        <h3>{t("أعمال WIR المعتمدة (A/B فقط)", "Approved WIRs (A/B only)")}</h3>
        <div className="toolbar" style={{ margin: "8px 0" }}>
          <select value={pick.submission_id} onChange={(e) => setPick({ ...pick, submission_id: e.target.value })} style={{ maxWidth: 360 }}>
            <option value="">—</option>{(wirs.data as Row[] ?? []).filter((w) => !used.has(w.id)).map((w) => <option key={w.id} value={w.id}>{w.ref_no} [{w.code}] {w.title}</option>)}</select>
          <input type="number" placeholder={t("المبلغ", "Amount")} value={pick.amount} onChange={(e) => setPick({ ...pick, amount: e.target.value })} style={{ width: 160 }} />
          <button className="primary" disabled={!pick.submission_id || !pick.amount} onClick={add}>＋</button></div>
        <table className="data"><tbody>{rows.map((r) => <tr key={r.id}><td>{r.submissions?.ref_no}</td><td><Tx>{r.submissions?.title}</Tx></td>
          <td><span className={`badge code-${r.submissions?.code}`}>{r.submissions?.code}</span></td><td className="num">{fmtMoney(r.amount)}</td>
          <td className="actions"><button className="ghost icon danger" onClick={() => del(r.id)}>🗑</button></td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>{t("الإجمالي / المحتجز / الصافي", "Gross / retention / net")}</td><td className="num" colSpan={2}>{fmtMoney(gross)} / {fmtMoney(ret)} / {fmtMoney(gross - ret)}</td></tr></tfoot></table>
        <h3 style={{ marginTop: 16 }}>{t("سجل المتابعة", "Follow-up log")}</h3>
        <div className="toolbar" style={{ margin: "8px 0" }}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("ملاحظة متابعة…", "Follow-up note…")} />
          <button disabled={!note.trim()} onClick={addNote}>{t("إضافة", "Add")}</button></div>
        {(notes.data as Row[] ?? []).map((n) => <div key={n.id} style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
          <small className="muted">{fmtDateTime(n.at)}</small><div><Tx>{n.note}</Tx></div></div>)}
      </Modal>
    );
  }
}

// --------------------------------------------------------------- planning
function Planning({ project }: { project: Row }) {
  const { t, fmtDate } = useI18n();
  const [k, setK] = useState(0);
  const acts = useLoad(async () => (await supabase.from("cp_activities").select("*").eq("project_id", project.id).order("sort_order").order("start_date")).data ?? [], [project.id, k]);
  const rows = (acts.data ?? []) as Row[];
  const range = useMemo(() => {
    if (!rows.length) return null;
    const s = Math.min(...rows.map((r) => +new Date(r.start_date))), e = Math.max(...rows.map((r) => +new Date(r.end_date)));
    return { s, e: Math.max(e, s + 86400000) };
  }, [rows]);
  const pos = (d: string) => range ? ((+new Date(d) - range.s) / (range.e - range.s)) * 100 : 0;
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return (
    <>
      <div className="card gantt">
        <h2 style={{ marginBottom: 8 }}>{t("مخطط جانت", "Gantt chart")} {range && <small className="muted">{fmtDate(new Date(range.s))} → {fmtDate(new Date(range.e))}</small>}</h2>
        {!rows.length ? <Empty /> : <div style={{ minWidth: 700 }}>
          {rows.map((r) => {
            const from = pos(r.start_date), to = pos(r.end_date) + (100 * 86400000) / (range!.e - range!.s);
            return <div className="gantt-row" key={r.id}>
              <div className="label" title={r.name}>{r.wbs && <small className="muted">{r.wbs} </small>}<Tx>{r.name}</Tx></div>
              <div className="gantt-track" style={{ backgroundSize: `${100 / 12}% 100%` }}>
                <div className="gantt-bar" style={{ insetInlineStart: `${from}%`, width: `${Math.max(1, to - from)}%` }}
                  title={`${fmtDate(r.start_date)} → ${fmtDate(r.end_date)} · ${r.progress}%${r.depends_on?.length ? " · ← " + r.depends_on.map((d: string) => names.get(d)).join(", ") : ""}`}>
                  <i style={{ width: `${r.progress}%` }} /></div></div></div>;
          })}</div>}
      </div>
      <CrudPage key={k} table="cp_activities" module="construction" canWrite title={{ ar: "الأنشطة", en: "Activities" }}
        filter={(q) => q.eq("project_id", project.id)} filterKey={project.id} orderBy={{ column: "sort_order", ascending: true }}
        defaults={{ project_id: project.id, progress: 0, depends_on: [] }} onSaved={() => setK(k + 1)}
        fields={[
          { key: "project_id", ar: "", en: "", hideInForm: true, hideInTable: true },
          { key: "wbs", ar: "WBS", en: "WBS" },
          { key: "name", ar: "النشاط", en: "Activity", required: true },
          { key: "start_date", ar: "البداية", en: "Start", type: "date", required: true },
          { key: "end_date", ar: "النهاية", en: "End", type: "date", required: true },
          { key: "progress", ar: "الإنجاز", en: "Progress", type: "percent" },
          { key: "owner", ar: "المسؤول", en: "Owner" },
          { key: "depends_on", ar: "يعتمد على", en: "Depends on", type: "tags", hideInForm: true,
            render: (r) => (r.depends_on ?? []).map((d: string) => names.get(d)).filter(Boolean).join("، ") },
          { key: "sort_order", ar: "الترتيب", en: "Order", type: "number", hideInTable: true },
        ]}
        rowActions={(r) => <DependsPicker row={r} all={rows} onSaved={() => setK(k + 1)} />} />
    </>
  );
}

function DependsPicker({ row, all, onSaved }: { row: Row; all: Row[]; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(row.depends_on ?? []);
  const save = async () => {
    const { error } = await supabase.from("cp_activities").update({ depends_on: sel }).eq("id", row.id);
    if (error) toast.error(error); else { setOpen(false); onSaved(); }
  };
  return <>
    <button className="ghost icon" title={t("الاعتماديات", "Dependencies")} onClick={() => setOpen(true)}>⛓</button>
    {open && <Modal title={t("الاعتماديات", "Dependencies")} onClose={() => setOpen(false)} footer={<button className="primary" onClick={save}>{t("حفظ", "Save")}</button>}>
      {all.filter((a) => a.id !== row.id).map((a) => <label key={a.id} className="check"><input type="checkbox" checked={sel.includes(a.id)}
        onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} /> {a.wbs} {a.name}</label>)}
    </Modal>}
  </>;
}

// ------------------------------------------------------------ daily report
function Daily({ project }: { project: Row }) {
  const { t, fmtDate } = useI18n();
  const toast = useToast();
  const trades = useLookup("trade");
  const [k, setK] = useState(0);
  const [form, setForm] = useState<Row | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const list = useLoad(async () => (await supabase.from("cp_daily_reports").select("*").eq("project_id", project.id).order("report_date", { ascending: false }).limit(60)).data ?? [], [project.id, k]);
  const save = async () => {
    const paths: string[] = [...(form!.photos ?? [])];
    for (const f of photos) {
      const p = `${project.id}/daily/${form!.report_date}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("construction").upload(p, f);
      if (up.error) return toast.error(up.error);
      paths.push(p);
    }
    const { id, created_at, created_by, ...rest } = form!;
    void created_at; void created_by;
    const payload = { ...rest, project_id: project.id, photos: paths };
    const res = id ? await supabase.from("cp_daily_reports").update(payload).eq("id", id) : await supabase.from("cp_daily_reports").insert(payload);
    if (res.error) toast.error(res.error); else { setForm(null); setPhotos([]); setK(k + 1); toast.ok(t("تم الحفظ", "Saved")); }
  };
  const showPhoto = async (p: string) => window.open(await signedUrl("construction", p, 300), "_blank", "noopener");
  const labor = (form?.labor ?? {}) as Record<string, number>;
  return (
    <>
      <div className="toolbar"><button className="primary" onClick={() => setForm({ report_date: todayISO(), labor: {}, photos: [] })}>＋ {t("تقرير يومي", "Daily report")}</button></div>
      <div className="card flush">{!(list.data as Row[])?.length ? <Empty /> : <table className="data">
        <thead><tr><th>{t("التاريخ", "Date")}</th><th>{t("الطقس", "Weather")}</th><th>{t("العمالة", "Labour")}</th><th>{t("الأعمال", "Work done")}</th><th>{t("المشاكل", "Issues")}</th><th>📷</th><th /></tr></thead>
        <tbody>{(list.data as Row[]).map((r) => <tr key={r.id}><td>{fmtDate(r.report_date)}</td><td><Tx>{r.weather}</Tx> {r.temperature != null && `${r.temperature}°`}</td>
          <td>{Object.values(r.labor ?? {}).reduce((s: number, n) => s + Number(n), 0)}</td><td><Tx>{r.work_done}</Tx></td><td><Tx>{r.issues}</Tx></td>
          <td>{(r.photos ?? []).map((p: string, i: number) => <button key={p} className="ghost sm" onClick={() => showPhoto(p)}>{i + 1}</button>)}</td>
          <td className="actions"><button className="ghost icon" onClick={() => setForm({ ...r })}>✎</button></td></tr>)}</tbody></table>}</div>
      {form && <Modal wide title={t("التقرير اليومي للموقع", "Daily site report")} onClose={() => setForm(null)} footer={<button className="primary" onClick={save}>{t("حفظ", "Save")}</button>}>
        <div className="form-grid">
          <label className="field">{t("التاريخ", "Date")}<input type="date" value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} /></label>
          <label className="field">{t("الطقس", "Weather")}<SelectOther category="weather" value={form.weather} onChange={(v) => setForm({ ...form, weather: v })} /></label>
          <label className="field">{t("الحرارة °C", "Temperature °C")}<input type="number" value={form.temperature ?? ""} onChange={(e) => setForm({ ...form, temperature: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label className="field">{t("المعدات", "Equipment")}<input value={form.equipment ?? ""} onChange={(e) => setForm({ ...form, equipment: e.target.value })} /></label>
        </div>
        <h3 style={{ margin: "14px 0 8px" }}>{t("العمالة لكل تخصص", "Labour per trade")}</h3>
        <div className="form-grid">{[...new Set([...trades, ...Object.keys(labor)])].map((tr) => <label key={tr} className="field"><Tx>{tr}</Tx>
          <input type="number" min={0} value={labor[tr] ?? ""} onChange={(e) => setForm({ ...form, labor: { ...labor, [tr]: e.target.value === "" ? 0 : Number(e.target.value) } })} /></label>)}
          <label className="field">{t("تخصص آخر", "Other trade")}<SelectOther category="trade" value="" onChange={(v) => setForm({ ...form, labor: { ...labor, [v]: labor[v] ?? 0 } })} /></label></div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field wide">{t("الأعمال المنفذة", "Work done")}<textarea value={form.work_done ?? ""} onChange={(e) => setForm({ ...form, work_done: e.target.value })} /></label>
          <label className="field wide">{t("المشاكل والمعوقات", "Issues")}<textarea value={form.issues ?? ""} onChange={(e) => setForm({ ...form, issues: e.target.value })} /></label>
          <label className="field wide">{t("الصور", "Photos")}<input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} /></label>
        </div>
      </Modal>}
    </>
  );
}

// ------------------------------------------------- weekly / monthly report
function Periodic({ project }: { project: Row }) {
  const { t, lang, fmtDate, fmtMoney } = useI18n();
  const [kind, setKind] = useState<"weekly" | "monthly">("weekly");
  const [anchor, setAnchor] = useState(todayISO());
  const r = kind === "weekly" ? weekRange(anchor) : monthRange(anchor);
  const { data } = useLoad(async () => {
    const [daily, subs, inv, acts] = await Promise.all([
      supabase.from("cp_daily_reports").select("*").eq("project_id", project.id).gte("report_date", r.from).lte("report_date", r.to).order("report_date"),
      supabase.from("submissions_view").select("*").eq("project_id", project.id).or(`and(submitted_on.gte.${r.from},submitted_on.lte.${r.to}),and(returned_on.gte.${r.from},returned_on.lte.${r.to})`),
      supabase.from("cp_invoices_view").select("*").eq("project_id", project.id).lte("period_from", r.to).gte("period_to", r.from),
      supabase.from("cp_activities").select("*").eq("project_id", project.id).lte("start_date", r.to).gte("end_date", r.from),
    ]);
    return { daily: daily.data ?? [], subs: subs.data ?? [], inv: inv.data ?? [], acts: acts.data ?? [] };
  }, [project.id, r.from, r.to]);
  const d = data;
  const laborTotals = (d?.daily ?? []).reduce<Record<string, number>>((acc, x: any) => {
    Object.entries(x.labor ?? {}).forEach(([k, v]) => { acc[k] = (acc[k] ?? 0) + Number(v); }); return acc;
  }, {});
  const title = `${kind === "weekly" ? t("التقرير الأسبوعي", "Weekly report") : t("التقرير الشهري", "Monthly report")} — ${project.code}`;
  const pdf = () => exportPdf({
    title, subtitle: `${project.name} · ${fmtDate(r.from)} — ${fmtDate(r.to)}`, lang, filename: `${project.code}-${kind}-${r.from}`,
    facts: [[t("التقارير اليومية", "Daily reports"), String(d?.daily.length ?? 0)], [t("المستندات", "Submissions"), String(d?.subs.length ?? 0)],
      [t("إجمالي العمالة (يوم-عامل)", "Total labour (man-days)"), String(Object.values(laborTotals).reduce((s, n) => s + n, 0))]],
    sections: [
      { heading: t("العمالة لكل تخصص", "Labour per trade"), rows: Object.entries(laborTotals).map(([k, v]) => ({ k, v })),
        columns: [{ header: t("التخصص", "Trade"), value: (x) => x.k as string }, { header: t("يوم-عامل", "Man-days"), value: (x) => x.v as number }] },
      { heading: t("سجل الموقع اليومي", "Daily site log"), rows: d?.daily ?? [], columns: [
        { header: t("التاريخ", "Date"), value: (x) => fmtDate(x.report_date as string) }, { header: t("الطقس", "Weather"), value: (x) => x.weather as string },
        { header: t("الأعمال", "Work"), value: (x) => x.work_done as string }, { header: t("المشاكل", "Issues"), value: (x) => x.issues as string }] },
      { heading: t("المستندات", "Submissions"), rows: d?.subs ?? [], columns: [
        { header: t("المرجع", "Ref"), value: (x) => x.ref_no as string }, { header: t("العنوان", "Title"), value: (x) => x.title as string },
        { header: t("الكود", "Code"), value: (x) => (x.code as string) ?? t("بانتظار", "Pending") }, { header: t("أيام الانتظار", "Waiting"), value: (x) => x.waiting_days as number }] },
      { heading: t("المستخلصات", "Invoices"), rows: d?.inv ?? [], columns: [
        { header: "#", value: (x) => x.invoice_no as number }, { header: t("الصافي", "Net"), value: (x) => fmtMoney(x.net_amount as number) },
        { header: t("الحالة", "Status"), value: (x) => { const s = INVOICE_STATUS.find((i) => i.value === x.status); return s ? (lang === "ar" ? s.ar : s.en) : ""; } }] },
      { heading: t("الأنشطة", "Activities"), rows: d?.acts ?? [], columns: [
        { header: t("النشاط", "Activity"), value: (x) => x.name as string }, { header: t("الإنجاز", "Progress"), value: (x) => `${x.progress}%` },
        { header: t("النهاية", "End"), value: (x) => fmtDate(x.end_date as string) }] },
    ],
  });
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2><div className="toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value as "weekly")} style={{ width: 130 }}>
          <option value="weekly">{t("أسبوعي", "Weekly")}</option><option value="monthly">{t("شهري", "Monthly")}</option></select>
        {kind === "weekly" ? <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} style={{ width: 160 }} />
          : <input type="month" value={anchor.slice(0, 7)} onChange={(e) => setAnchor(e.target.value + "-01")} style={{ width: 160 }} />}
        <button onClick={() => window.print()}>🖨</button>
        <button className="primary" onClick={pdf}>⬇ PDF</button></div></div>
      <p className="muted">{fmtDate(r.from)} — {fmtDate(r.to)} · {t("يُحسب تلقائيًا من التقارير اليومية والمستندات والمستخلصات والأنشطة", "Computed automatically from daily reports, submissions, invoices and activities")}</p>
      {d && <div className="kpis">
        <Kpi label={t("التقارير اليومية", "Daily reports")} value={d.daily.length} />
        <Kpi label={t("يوم-عامل", "Man-days")} value={Object.values(laborTotals).reduce((s, n) => s + n, 0)} />
        <Kpi label={t("مستندات", "Submissions")} value={d.subs.length} />
        <Kpi label={t("مستخلصات", "Invoices")} value={d.inv.length} />
      </div>}
      {d && <div className="cols-2" style={{ marginTop: 12 }}>
        <div><h3>{t("العمالة لكل تخصص", "Labour per trade")}</h3><table className="data"><tbody>{Object.entries(laborTotals).map(([k, v]) =>
          <tr key={k}><td><Tx>{k}</Tx></td><td className="num">{v}</td></tr>)}</tbody></table></div>
        <div><h3>{t("الأنشطة", "Activities")}</h3><table className="data"><tbody>{(d.acts as Row[]).map((a) =>
          <tr key={a.id}><td><Tx>{a.name}</Tx></td><td style={{ width: 160 }}><Progress value={a.progress} /></td></tr>)}</tbody></table></div>
      </div>}
    </div>
  );
}

// ---------------------------------------------------------------- members
function Members({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [add, setAdd] = useState({ user_id: "", role: "viewer" });
  const people = useLoad(async () => (await supabase.from("directory").select("id, full_name, username").order("full_name")).data ?? []);
  const members = useLoad(async () => (await supabase.from("project_members").select("*").eq("project_id", projectId)).data ?? [], [projectId]);
  const name = (id: string) => (people.data as Row[] ?? []).find((p) => p.id === id)?.full_name ?? id;
  const save = async (user_id: string, role: string) => {
    const { error } = await supabase.from("project_members").upsert({ project_id: projectId, user_id, role });
    if (error) toast.error(error); else { members.reload(); setAdd({ user_id: "", role: "viewer" }); }
  };
  const remove = async (user_id: string) => {
    const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", user_id);
    if (error) toast.error(error); else members.reload();
  };
  const roleLabel = (r: { ar: string; en: string }) => (lang === "ar" ? r.ar : r.en);
  return (
    <div className="card">
      <p className="muted">{t("الصلاحيات داخل المشروع: مراقب الوثائق يدير المستندات، المحاسب المستخلصات، المخطط الأنشطة، مهندس الموقع التقارير اليومية، والمشاهد للقراءة فقط.",
        "Per-project roles: document controller → submissions, accountant → invoices, planner → activities, site engineer → daily reports, viewer → read only.")}</p>
      {can("construction") && <div className="toolbar" style={{ margin: "10px 0" }}>
        <select value={add.user_id} onChange={(e) => setAdd({ ...add, user_id: e.target.value })} style={{ maxWidth: 260 }}>
          <option value="">—</option>{(people.data as Row[] ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.username})</option>)}</select>
        <select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} style={{ maxWidth: 200 }}>
          {CP_ROLES.map((r) => <option key={r.value} value={r.value}>{roleLabel(r)}</option>)}</select>
        <button className="primary" disabled={!add.user_id} onClick={() => save(add.user_id, add.role)}>＋ {t("إضافة", "Add")}</button></div>}
      <table className="data"><tbody>{(members.data as Row[] ?? []).map((m) => <tr key={m.user_id}><td>{name(m.user_id)}</td>
        <td><select value={m.role} onChange={(e) => save(m.user_id, e.target.value)} style={{ maxWidth: 200 }}>
          {CP_ROLES.map((r) => <option key={r.value} value={r.value}>{roleLabel(r)}</option>)}</select></td>
        <td className="actions"><button className="ghost icon danger" onClick={() => remove(m.user_id)}>🗑</button></td></tr>)}</tbody></table>
    </div>
  );
}
