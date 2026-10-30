// Settlements: choosing an employee fills name, hire date, salary and leave
// balance; uploaded PDFs are read by AI for hire date and salary. EOSB and
// totals are computed in the database (Saudi labour law).
import { useEffect, useState } from "react";
import { callFn, fileToBase64, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n, todayISO } from "../../lib/i18n";
import { exportPdf } from "../../lib/pdf";
import { CrudPage } from "../../components/CrudPage";
import { Modal, useToast } from "../../components/ui";

const REASONS = [
  { value: "contract_end", ar: "انتهاء العقد", en: "Contract end" },
  { value: "termination", ar: "إنهاء من الشركة", en: "Termination" },
  { value: "resignation", ar: "استقالة", en: "Resignation" },
];

export default function Settlements() {
  const { can } = useAuth();
  const { t, lang, fmtMoney, fmtDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const reason = (v: string) => { const o = REASONS.find((r) => r.value === v); return o ? (lang === "ar" ? o.ar : o.en) : v; };

  const pdf = (r: any) => exportPdf({
    title: t("مخالصة نهائية", "Final settlement"), subtitle: r.employee_name, lang, orientation: "portrait", filename: `settlement-${r.employee_name}`,
    facts: [
      [t("الموظف", "Employee"), r.employee_name], [t("تاريخ التعيين", "Hire date"), fmtDate(r.hire_date)],
      [t("تاريخ الانتهاء", "End date"), fmtDate(r.end_date)], [t("السبب", "Reason"), reason(r.reason)],
      [t("مدة الخدمة (سنة)", "Service (years)"), String(r.service_years)], [t("آخر أجر", "Last wage"), fmtMoney(r.last_salary)],
      [t("مكافأة نهاية الخدمة", "End-of-service benefit"), fmtMoney(r.eosb)],
      [t("رصيد الإجازة (يوم)", "Leave balance (days)"), String(r.leave_balance_days)],
      [t("بدل الإجازات", "Leave compensation"), fmtMoney(r.leave_compensation)],
      [t("مستحقات أخرى", "Other dues"), fmtMoney(r.other_dues)], [t("خصومات", "Deductions"), fmtMoney(r.deductions)],
      [t("الإجمالي المستحق", "Total due"), fmtMoney(r.total)],
    ],
    sections: [{ columns: [{ header: t("توقيع الموظف", "Employee signature"), value: () => "" }, { header: t("توقيع الموارد البشرية", "HR signature"), value: () => "" }], rows: [{}] }],
  });

  return (
    <>
      <div className="page-head"><h1>{t("المخالصات", "Settlements")}</h1>
        {can("settlements", true) && <button className="primary" onClick={() => setOpen(true)}>＋ {t("مخالصة جديدة", "New settlement")}</button>}</div>
      <CrudPage key={key} table="settlements" module="settlements" canWrite={false} title={{ ar: "المخالصات", en: "Settlements" }}
        orderBy={{ column: "created_at" }} totals={["total"]} rowActions={(r) => <button className="sm" onClick={() => pdf(r)}>⬇ PDF</button>}
        fields={[
          { key: "employee_name", ar: "الموظف", en: "Employee" },
          { key: "hire_date", ar: "التعيين", en: "Hired", type: "date" },
          { key: "end_date", ar: "الانتهاء", en: "End", type: "date" },
          { key: "reason", ar: "السبب", en: "Reason", type: "select", options: REASONS },
          { key: "service_years", ar: "سنوات الخدمة", en: "Years", type: "number" },
          { key: "last_salary", ar: "آخر أجر", en: "Last wage", type: "money" },
          { key: "eosb", ar: "نهاية الخدمة", en: "EOSB", type: "money" },
          { key: "leave_compensation", ar: "بدل إجازات", en: "Leave comp.", type: "money" },
          { key: "total", ar: "الإجمالي", en: "Total", type: "money" },
        ]} />
      {open && <NewSettlement onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setKey(key + 1); }} />}
    </>
  );
}

function NewSettlement({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [emps, setEmps] = useState<any[] | null>(null);
  const [f, setF] = useState<any>({ reason: "contract_end", end_date: todayISO(), other_dues: 0, deductions: 0, leave_balance_days: 0, source_files: [] });
  const [reading, setReading] = useState(false);
  const [ai, setAi] = useState<any>(null);

  useEffect(() => { supabase.from("employees").select("*").order("full_name").then(({ data }) => setEmps(data ?? [])); }, []);

  const pick = async (id: string) => {
    const e = emps?.find((x) => x.id === id);
    if (!e) return setF({ ...f, employee_id: null });
    const { data: b } = await supabase.from("leave_balances").select("balance").eq("employee_id", id).maybeSingle();
    setF({ ...f, employee_id: id, employee_name: e.full_name, hire_date: e.hire_date,
      last_salary: Number(e.basic_salary) + Number(e.housing_allowance) + Number(e.transport_allowance) + Number(e.other_allowance),
      leave_balance_days: Math.max(0, Number(b?.balance ?? 0)) });
  };

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    try {
      const list = await Promise.all(Array.from(files).map(async (x) => ({ name: x.name, mime: x.type, base64: await fileToBase64(x) })));
      const paths: string[] = [];
      for (const x of Array.from(files)) {
        const p = `settlements/${Date.now()}-${x.name.replace(/[^\w.\-]+/g, "_")}`;
        if (!(await supabase.storage.from("hr-files").upload(p, x)).error) paths.push(p);
      }
      const r = await callFn<any>("ai-extract", { files: list });
      setAi(r);
      setF((cur: any) => ({ ...cur, hire_date: r.hire_date ?? cur.hire_date, last_salary: r.salary ?? cur.last_salary,
        employee_name: cur.employee_name ?? r.employee_name, source_files: [...cur.source_files, ...paths], ai_extracted: r }));
      toast.ok(t("تمت قراءة الملفات بالذكاء الاصطناعي", "Files read with AI"));
    } catch (e) { toast.error(e); }
    setReading(false);
  };

  const save = async () => {
    const { error } = await supabase.from("settlements").insert({
      employee_id: f.employee_id, employee_name: f.employee_name, hire_date: f.hire_date, end_date: f.end_date, reason: f.reason,
      last_salary: f.last_salary, leave_balance_days: f.leave_balance_days, other_dues: f.other_dues, deductions: f.deductions,
      source_files: f.source_files, ai_extracted: f.ai_extracted ?? null, notes: f.notes ?? null,
    });
    if (error) toast.error(error); else { toast.ok(t("تم الحفظ", "Saved")); onSaved(); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  return (
    <Modal title={t("مخالصة جديدة", "New settlement")} onClose={onClose}
      footer={<><button onClick={onClose}>{t("إلغاء", "Cancel")}</button><button className="primary" onClick={save} disabled={!f.employee_name || !f.hire_date}>{t("حفظ", "Save")}</button></>}>
      <div className="form-grid">
        <label className="field">{t("الموظف", "Employee")}<select value={f.employee_id ?? ""} onChange={(e) => pick(e.target.value)}>
          <option value="">—</option>{(emps ?? []).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
        <label className="field">{t("الاسم", "Name")}<input value={f.employee_name ?? ""} onChange={set("employee_name")} /></label>
        <label className="field">{t("تاريخ التعيين", "Hire date")}<input type="date" value={f.hire_date ?? ""} onChange={set("hire_date")} /></label>
        <label className="field">{t("تاريخ الانتهاء", "End date")}<input type="date" value={f.end_date ?? ""} onChange={set("end_date")} /></label>
        <label className="field">{t("السبب", "Reason")}<select value={f.reason} onChange={set("reason")}>
          {REASONS.map((r) => <option key={r.value} value={r.value}>{lang === "ar" ? r.ar : r.en}</option>)}</select></label>
        <label className="field">{t("آخر أجر شهري كامل", "Last full monthly wage")}<input type="number" value={f.last_salary ?? ""} onChange={set("last_salary")} /></label>
        <label className="field">{t("رصيد الإجازة (يوم)", "Leave balance (days)")}<input type="number" value={f.leave_balance_days} onChange={set("leave_balance_days")} /></label>
        <label className="field">{t("مستحقات أخرى", "Other dues")}<input type="number" value={f.other_dues} onChange={set("other_dues")} /></label>
        <label className="field">{t("خصومات", "Deductions")}<input type="number" value={f.deductions} onChange={set("deductions")} /></label>
        <label className="field wide">{t("ملاحظات", "Notes")}<textarea value={f.notes ?? ""} onChange={set("notes")} /></label>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <b>✦ {t("قراءة المستندات بالذكاء الاصطناعي", "Read documents with AI")}</b>
        <p className="muted">{t("ارفع العقد أو العرض الوظيفي أو تعريف الراتب (PDF/صور) لاستخراج تاريخ التعيين والراتب.",
          "Upload the contract, offer or salary letter (PDF/images) to extract hire date and salary.")}</p>
        <label className="btn">{reading ? "…" : `⬆ ${t("رفع ملفات", "Upload files")}`}
          <input type="file" multiple hidden accept="application/pdf,image/*" disabled={reading} onChange={(e) => { readFiles(e.target.files); e.target.value = ""; }} /></label>
        {ai && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }} dir="ltr">{JSON.stringify(ai, null, 2)}</pre>}
      </div>
      <p className="muted">{t("مكافأة نهاية الخدمة وبدل الإجازات والإجمالي تُحسب في قاعدة البيانات عند الحفظ.", "EOSB, leave compensation and the total are computed by the database on save.")}</p>
    </Modal>
  );
}
