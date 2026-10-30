import type { Field } from "../../components/CrudPage";

export const EMPLOYEE_FIELDS: Field[] = [
  { key: "employee_no", ar: "الرقم الوظيفي", en: "Emp #" },
  { key: "full_name", ar: "الاسم", en: "Name", required: true },
  { key: "full_name_en", ar: "الاسم بالإنجليزية", en: "Name (English)", hideInTable: true },
  { key: "job_title", ar: "المسمى الوظيفي", en: "Job title", type: "lookup", lookup: "job_title" },
  { key: "department", ar: "القسم", en: "Department", type: "lookup", lookup: "department" },
  { key: "establishment", ar: "المنشأة", en: "Establishment", type: "lookup", lookup: "establishment" },
  { key: "email", ar: "البريد", en: "Email", type: "email", hideInTable: true },
  { key: "phone", ar: "الجوال", en: "Phone" },
  { key: "national_id", ar: "الهوية/الإقامة", en: "ID / Iqama", hideInTable: true },
  { key: "nationality", ar: "الجنسية", en: "Nationality", type: "lookup", lookup: "nationality", hideInTable: true },
  { key: "hire_date", ar: "تاريخ التعيين", en: "Hire date", type: "date" },
  { key: "basic_salary", ar: "الراتب الأساسي", en: "Basic salary", type: "money" },
  { key: "housing_allowance", ar: "بدل السكن", en: "Housing", type: "money", hideInTable: true },
  { key: "transport_allowance", ar: "بدل النقل", en: "Transport", type: "money", hideInTable: true },
  { key: "other_allowance", ar: "بدلات أخرى", en: "Other allowances", type: "money", hideInTable: true },
  { key: "annual_leave_days", ar: "أيام الإجازة السنوية", en: "Annual leave days", type: "number", hideInTable: true },
  { key: "supervisor_id", ar: "المشرف", en: "Supervisor", type: "ref", ref: { table: "employees", label: "full_name" }, hideInTable: true },
  { key: "device_user_id", ar: "رقم البصمة", en: "Device PIN", hideInTable: true },
  { key: "status", ar: "الحالة", en: "Status", type: "select", options: [
    { value: "active", ar: "على رأس العمل", en: "Active", tone: "ok" },
    { value: "inactive", ar: "منتهي", en: "Inactive", tone: "" }] },
  { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
];

export const LEAVE_TYPES = [
  { value: "annual", ar: "سنوية", en: "Annual" }, { value: "sick", ar: "مرضية", en: "Sick" },
  { value: "unpaid", ar: "بدون راتب", en: "Unpaid" }, { value: "emergency", ar: "اضطرارية", en: "Emergency" },
  { value: "other", ar: "أخرى", en: "Other" },
];
