export const CP_STATUS = [
  { value: "planning", ar: "تخطيط", en: "Planning", tone: "info" },
  { value: "active", ar: "جاري", en: "Active", tone: "ok" },
  { value: "on_hold", ar: "متوقف", en: "On hold", tone: "warn" },
  { value: "completed", ar: "منتهي", en: "Completed", tone: "" },
];

export const CP_ROLES = [
  { value: "admin", ar: "مسؤول", en: "Admin" },
  { value: "project_manager", ar: "مدير مشروع", en: "Project manager" },
  { value: "site_engineer", ar: "مهندس موقع", en: "Site engineer" },
  { value: "document_controller", ar: "مراقب وثائق", en: "Document controller" },
  { value: "planner", ar: "مخطط", en: "Planner" },
  { value: "accountant", ar: "محاسب", en: "Accountant" },
  { value: "viewer", ar: "مشاهد", en: "Viewer" },
];

export const JOB_TITLES = [
  { value: "project_director", ar: "مدير المشاريع", en: "Project director" },
  { value: "project_manager", ar: "مدير المشروع", en: "Project manager" },
  { value: "construction_manager", ar: "مدير التنفيذ", en: "Construction manager" },
  { value: "site_engineer", ar: "مهندس موقع", en: "Site engineer" },
  { value: "planning_engineer", ar: "مهندس تخطيط", en: "Planning engineer" },
  { value: "qaqc_engineer", ar: "مهندس جودة", en: "QA/QC engineer" },
  { value: "hse_officer", ar: "مسؤول سلامة", en: "HSE officer" },
  { value: "document_controller", ar: "مراقب وثائق", en: "Document controller" },
  { value: "quantity_surveyor", ar: "مهندس كميات", en: "Quantity surveyor" },
  { value: "mep_engineer", ar: "مهندس كهروميكانيك", en: "MEP engineer" },
  { value: "surveyor", ar: "مساح", en: "Surveyor" },
  { value: "foreman", ar: "مراقب عمال", en: "Foreman" },
  { value: "accountant", ar: "محاسب", en: "Accountant" },
];

export const SUB_TYPES = [
  { value: "MIR", ar: "MIR — فحص مواد", en: "MIR — Material inspection" },
  { value: "SUBMITTAL", ar: "Submittal — اعتماد", en: "Submittal" },
  { value: "SHOP_DRAWING", ar: "Shop Drawing — مخططات تنفيذية", en: "Shop drawing" },
  { value: "WIR", ar: "WIR — فحص أعمال", en: "WIR — Work inspection" },
  { value: "OTHER", ar: "أخرى", en: "Other" },
];

export const CODES = [
  { value: "A", ar: "A — معتمد", en: "A — Approved", tone: "code-A" },
  { value: "B", ar: "B — معتمد بملاحظات", en: "B — Approved as noted", tone: "code-B" },
  { value: "C", ar: "C — يعاد التقديم", en: "C — Revise & resubmit", tone: "code-C" },
  { value: "D", ar: "D — مرفوض", en: "D — Rejected", tone: "code-D" },
];

export const INVOICE_STATUS = [
  { value: "draft", ar: "مسودة", en: "Draft", tone: "" },
  { value: "submitted", ar: "مقدّم", en: "Submitted", tone: "info" },
  { value: "under_review", ar: "قيد المراجعة", en: "Under review", tone: "warn" },
  { value: "approved", ar: "معتمد", en: "Approved", tone: "ok" },
  { value: "paid", ar: "مصروف", en: "Paid", tone: "ok" },
  { value: "rejected", ar: "مرفوض", en: "Rejected", tone: "danger" },
];
