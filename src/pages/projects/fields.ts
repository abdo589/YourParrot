import type { Field } from "../../components/CrudPage";

export const STATUS_OPTIONS = [
  { value: "planning", ar: "تخطيط", en: "Planning", tone: "info" },
  { value: "active", ar: "جاري", en: "Active", tone: "ok" },
  { value: "on_hold", ar: "متوقف", en: "On hold", tone: "warn" },
  { value: "completed", ar: "منتهي", en: "Completed", tone: "" },
];

export const projectRef = { table: "projects", label: "name", filter: (q: any) => q.is("deleted_at", null) };
export const employeeRef = { table: "employees", label: "full_name" };

export const PROJECT_FIELDS: Field[] = [
  { key: "name", ar: "اسم المشروع", en: "Project", required: true },
  { key: "client", ar: "العميل", en: "Client" },
  { key: "sector", ar: "القطاع", en: "Sector", type: "lookup", lookup: "sector" },
  { key: "project_manager", ar: "مدير المشروع", en: "Project manager" },
  { key: "contract_value", ar: "قيمة العقد", en: "Contract value", type: "money" },
  { key: "received", ar: "المستلم", en: "Received", type: "money", readOnly: true },
  { key: "progress", ar: "نسبة الإنجاز", en: "Progress", type: "percent" },
  { key: "status", ar: "الحالة", en: "Status", type: "select", options: STATUS_OPTIONS },
  { key: "start_date", ar: "تاريخ البداية", en: "Start", type: "date" },
  { key: "end_date", ar: "تاريخ النهاية", en: "End", type: "date" },
  { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
];
