export interface NavItem { to: string; module: string | string[]; ar: string; en: string; group: string }

export const GROUPS: Record<string, { ar: string; en: string }> = {
  projects: { ar: "المشاريع", en: "Projects" },
  hr: { ar: "الموارد البشرية", en: "Human resources" },
  sales: { ar: "المبيعات", en: "Sales" },
  cp: { ar: "إدارة مشاريع", en: "Project Admin" },
  comms: { ar: "التواصل", en: "Communication" },
  system: { ar: "النظام", en: "System" },
};

// A page is visible when the user has ANY of the listed modules.
export const NAV: NavItem[] = [
  { to: "/summary", module: "exec_summary", ar: "الملخص التنفيذي", en: "Executive summary", group: "projects" },
  { to: "/projects", module: "projects", ar: "المشاريع", en: "Projects", group: "projects" },
  { to: "/payments", module: "payments", ar: "المدفوعات", en: "Payments", group: "projects" },
  { to: "/budget", module: "budget", ar: "الميزانية", en: "Budget", group: "projects" },
  { to: "/accounting", module: "accounting", ar: "الحسابات", en: "Accounting", group: "projects" },
  { to: "/bank", module: "bank", ar: "البنك", en: "Bank", group: "projects" },
  { to: "/reports", module: "project_reports", ar: "تقارير المشاريع", en: "Project reports", group: "projects" },
  { to: "/custody", module: "custody", ar: "العهد", en: "Custody", group: "projects" },
  { to: "/fleet", module: "fleet", ar: "السيارات", en: "Fleet", group: "projects" },
  { to: "/documents", module: "documents", ar: "الوثائق", en: "Documents", group: "projects" },
  { to: "/residencies", module: "residencies", ar: "الإقامات", en: "Residencies", group: "projects" },

  { to: "/hr", module: "hr", ar: "لوحة الموارد البشرية", en: "HR dashboard", group: "hr" },
  { to: "/hr/employees", module: "hr", ar: "الموظفون", en: "Employees", group: "hr" },
  { to: "/hr/leaves", module: "leaves", ar: "الإجازات", en: "Leaves", group: "hr" },
  { to: "/hr/payroll", module: "payroll", ar: "الرواتب", en: "Payroll", group: "hr" },
  { to: "/hr/settlements", module: "settlements", ar: "المخالصات", en: "Settlements", group: "hr" },
  { to: "/hr/performance", module: "performance", ar: "تقييم الأداء", en: "Performance", group: "hr" },
  { to: "/attendance", module: "attendance", ar: "الحضور", en: "Attendance", group: "hr" },

  { to: "/sales", module: ["sales", "sales_all"], ar: "المبيعات", en: "Sales", group: "sales" },

  { to: "/cp", module: "construction", ar: "لوحة التحكم", en: "Dashboard", group: "cp" },
  { to: "/cp/projects", module: "construction", ar: "مشاريع المقاولات", en: "Construction projects", group: "cp" },

  { to: "/my-projects", module: ["my_projects", "my_projects_all"], ar: "مشاريعي", en: "My projects", group: "projects" },

  { to: "/messages", module: "messages", ar: "الرسائل", en: "Messages", group: "comms" },
  { to: "/mail", module: "mail", ar: "البريد", en: "Mail", group: "comms" },
  { to: "/my-checkin", module: "my_checkin", ar: "تسجيل حضوري", en: "My check-in", group: "comms" },

  { to: "/accounts", module: "accounts", ar: "الحسابات والمستخدمون", en: "User accounts", group: "system" },
  { to: "/dev", module: "dev", ar: "لوحة المطوّر", en: "Developer", group: "system" },
];

export function visible(item: NavItem, can: (m: string) => boolean) {
  return (Array.isArray(item.module) ? item.module : [item.module]).some((m) => can(m));
}
