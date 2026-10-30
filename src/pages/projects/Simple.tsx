import { CrudPage } from "../../components/CrudPage";
import { useI18n } from "../../lib/i18n";
import { employeeRef, projectRef } from "./fields";

function daysTo(d?: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
function Expiry({ date }: { date?: string | null }) {
  const { fmtDate, t } = useI18n();
  const n = daysTo(date);
  if (n === null) return <>—</>;
  const tone = n < 0 ? "danger" : n <= 30 ? "warn" : n <= 60 ? "info" : "ok";
  return <span className={`badge ${tone}`} title={`${n} ${t("يوم", "days")}`}>{fmtDate(date)}</span>;
}

export function Budget() {
  return <CrudPage table="budget_items" module="budget" title={{ ar: "الميزانية", en: "Budget" }} realtime
    orderBy={{ column: "period" }} totals={["planned", "actual"]} fields={[
      { key: "project_id", ar: "المشروع", en: "Project", type: "ref", ref: projectRef },
      { key: "period", ar: "الفترة", en: "Period", type: "date" },
      { key: "category", ar: "البند", en: "Category", type: "lookup", lookup: "budget_category", required: true },
      { key: "description", ar: "الوصف", en: "Description" },
      { key: "planned", ar: "المخطط", en: "Planned", type: "money" },
      { key: "actual", ar: "الفعلي", en: "Actual", type: "money" },
    ]} />;
}

export function Accounting() {
  return <CrudPage table="accounting_entries" module="accounting" title={{ ar: "الحسابات", en: "Accounting" }}
    orderBy={{ column: "entry_date" }} totals={["debit", "credit"]} fields={[
      { key: "entry_date", ar: "التاريخ", en: "Date", type: "date", required: true },
      { key: "account", ar: "الحساب", en: "Account", type: "lookup", lookup: "account", required: true },
      { key: "description", ar: "البيان", en: "Description" },
      { key: "project_id", ar: "المشروع", en: "Project", type: "ref", ref: projectRef },
      { key: "reference", ar: "المرجع", en: "Reference" },
      { key: "debit", ar: "مدين", en: "Debit", type: "money" },
      { key: "credit", ar: "دائن", en: "Credit", type: "money" },
    ]} />;
}

export function Custody() {
  return <CrudPage table="custody_items" module="custody" title={{ ar: "العهد", en: "Custody" }}
    orderBy={{ column: "issued_on" }} totals={["amount"]} fields={[
      { key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: employeeRef },
      { key: "holder_name", ar: "المستلم (إن لم يكن موظفًا)", en: "Holder (if not staff)" },
      { key: "item", ar: "العهدة", en: "Item", required: true },
      { key: "description", ar: "الوصف", en: "Description", hideInTable: true },
      { key: "amount", ar: "القيمة", en: "Value", type: "money" },
      { key: "issued_on", ar: "تاريخ التسليم", en: "Issued", type: "date" },
      { key: "returned_on", ar: "تاريخ الإرجاع", en: "Returned", type: "date" },
      { key: "status", ar: "الحالة", en: "Status", type: "select", options: [
        { value: "open", ar: "قائمة", en: "Open", tone: "warn" }, { value: "returned", ar: "مُرجعة", en: "Returned", tone: "ok" },
        { value: "settled", ar: "مُسوّاة", en: "Settled", tone: "info" }] },
    ]} />;
}

export function Fleet() {
  return <CrudPage table="vehicles" module="fleet" title={{ ar: "السيارات", en: "Fleet" }} orderBy={{ column: "plate_no", ascending: true }} fields={[
    { key: "plate_no", ar: "رقم اللوحة", en: "Plate", required: true },
    { key: "make", ar: "الشركة", en: "Make" }, { key: "model", ar: "الطراز", en: "Model" },
    { key: "year", ar: "السنة", en: "Year", type: "number" },
    { key: "driver_employee_id", ar: "السائق", en: "Driver", type: "ref", ref: employeeRef },
    { key: "registration_expiry", ar: "انتهاء الاستمارة", en: "Registration expiry", type: "date", render: (r) => <Expiry date={r.registration_expiry} /> },
    { key: "insurance_expiry", ar: "انتهاء التأمين", en: "Insurance expiry", type: "date", render: (r) => <Expiry date={r.insurance_expiry} /> },
    { key: "inspection_expiry", ar: "انتهاء الفحص", en: "Inspection expiry", type: "date", render: (r) => <Expiry date={r.inspection_expiry} /> },
    { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
  ]} />;
}

export function Documents() {
  return <CrudPage table="company_documents" module="documents" title={{ ar: "الوثائق", en: "Documents" }} orderBy={{ column: "expiry_date", ascending: true }} fields={[
    { key: "title", ar: "الوثيقة", en: "Document", required: true },
    { key: "doc_type", ar: "النوع", en: "Type", type: "lookup", lookup: "doc_type" },
    { key: "number", ar: "الرقم", en: "Number" },
    { key: "issue_date", ar: "تاريخ الإصدار", en: "Issued", type: "date" },
    { key: "expiry_date", ar: "تاريخ الانتهاء", en: "Expires", type: "date", render: (r) => <Expiry date={r.expiry_date} /> },
    { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
  ]} />;
}

export function Residencies() {
  return <CrudPage table="residencies" module="residencies" title={{ ar: "الإقامات", en: "Residencies" }} orderBy={{ column: "expiry_date", ascending: true }} fields={[
    { key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: employeeRef },
    { key: "holder_name", ar: "الاسم", en: "Name" },
    { key: "iqama_no", ar: "رقم الإقامة", en: "Iqama #" },
    { key: "issue_date", ar: "تاريخ الإصدار", en: "Issued", type: "date" },
    { key: "expiry_date", ar: "تاريخ الانتهاء", en: "Expires", type: "date", render: (r) => <Expiry date={r.expiry_date} /> },
    { key: "passport_no", ar: "رقم الجواز", en: "Passport #" },
    { key: "passport_expiry", ar: "انتهاء الجواز", en: "Passport expiry", type: "date", render: (r) => <Expiry date={r.passport_expiry} /> },
    { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
  ]} />;
}
