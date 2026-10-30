import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useI18n } from "./lib/i18n";
import { Layout } from "./components/Layout";
import { NAV, visible } from "./components/nav";
import { Login, Signup } from "./pages/Auth";
import { PhoneCheckin } from "./pages/attendance/PhoneCheckin";

const P = {
  ExecSummary: lazy(() => import("./pages/projects/ExecSummary")),
  Projects: lazy(() => import("./pages/projects/Projects")),
  Payments: lazy(() => import("./pages/projects/Payments")),
  Budget: lazy(() => import("./pages/projects/Simple").then((m) => ({ default: m.Budget }))),
  Accounting: lazy(() => import("./pages/projects/Simple").then((m) => ({ default: m.Accounting }))),
  Custody: lazy(() => import("./pages/projects/Simple").then((m) => ({ default: m.Custody }))),
  Fleet: lazy(() => import("./pages/projects/Simple").then((m) => ({ default: m.Fleet }))),
  Documents: lazy(() => import("./pages/projects/Simple").then((m) => ({ default: m.Documents }))),
  Residencies: lazy(() => import("./pages/projects/Simple").then((m) => ({ default: m.Residencies }))),
  Bank: lazy(() => import("./pages/projects/Bank")),
  ProjectReports: lazy(() => import("./pages/projects/ProjectReports")),
  HrDashboard: lazy(() => import("./pages/hr/HrDashboard")),
  Employees: lazy(() => import("./pages/hr/Employees")),
  EmployeeDetail: lazy(() => import("./pages/hr/EmployeeDetail")),
  Leaves: lazy(() => import("./pages/hr/Leaves")),
  Payroll: lazy(() => import("./pages/hr/Payroll")),
  Settlements: lazy(() => import("./pages/hr/Settlements")),
  Performance: lazy(() => import("./pages/hr/Performance")),
  Attendance: lazy(() => import("./pages/attendance/Attendance")),
  MyCheckin: lazy(() => import("./pages/attendance/MyCheckin")),
  Sales: lazy(() => import("./pages/sales/Sales")),
  Messages: lazy(() => import("./pages/comms/Messages")),
  Mail: lazy(() => import("./pages/comms/Mail")),
  CpDashboard: lazy(() => import("./pages/construction/CpDashboard")),
  CpProjects: lazy(() => import("./pages/construction/CpProjects")),
  CpProject: lazy(() => import("./pages/construction/CpProject")),
  MyProjects: lazy(() => import("./pages/myprojects/MyProjects")),
  Accounts: lazy(() => import("./pages/dev/Accounts")),
  Dev: lazy(() => import("./pages/dev/Dev")),
};

function Guard({ module, children }: { module: string | string[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useI18n();
  const ok = (Array.isArray(module) ? module : [module]).some((m) => can(m));
  return ok ? <>{children}</> : <div className="alert error">{t("ليست لديك صلاحية لهذه الصفحة.", "You don't have access to this page.")}</div>;
}

function Home() {
  const { can, profile } = useAuth();
  const { t } = useI18n();
  const first = NAV.find((i) => visible(i, can));
  if (first) return <Navigate to={first.to} replace />;
  return <div className="card"><h1>{t("مرحبًا", "Welcome")} {profile?.full_name}</h1>
    <p className="muted">{t("لم تُمنح أي صلاحيات بعد. تواصل مع المسؤول.", "No access has been granted yet. Contact an administrator.")}</p></div>;
}

const routes: [string, keyof typeof P, string | string[]][] = [
  ["/summary", "ExecSummary", "exec_summary"],
  ["/projects", "Projects", "projects"],
  ["/payments", "Payments", "payments"],
  ["/budget", "Budget", "budget"],
  ["/accounting", "Accounting", "accounting"],
  ["/bank", "Bank", "bank"],
  ["/reports", "ProjectReports", "project_reports"],
  ["/custody", "Custody", "custody"],
  ["/fleet", "Fleet", "fleet"],
  ["/documents", "Documents", "documents"],
  ["/residencies", "Residencies", "residencies"],
  ["/hr", "HrDashboard", "hr"],
  ["/hr/employees", "Employees", "hr"],
  ["/hr/employees/:id", "EmployeeDetail", "hr"],
  ["/hr/leaves", "Leaves", ["leaves", "my_checkin"]],
  ["/hr/payroll", "Payroll", "payroll"],
  ["/hr/settlements", "Settlements", "settlements"],
  ["/hr/performance", "Performance", "performance"],
  ["/attendance", "Attendance", "attendance"],
  ["/my-checkin", "MyCheckin", "my_checkin"],
  ["/sales", "Sales", ["sales", "sales_all"]],
  ["/messages", "Messages", "messages"],
  ["/mail", "Mail", "mail"],
  ["/cp", "CpDashboard", "construction"],
  ["/cp/projects", "CpProjects", "construction"],
  ["/cp/projects/:id", "CpProject", "construction"],
  ["/my-projects", "MyProjects", ["my_projects", "my_projects_all"]],
  ["/accounts", "Accounts", "accounts"],
  ["/dev", "Dev", "dev"],
];

export default function App() {
  const { session, loading, profile } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="empty">{t("جارٍ التحميل…", "Loading…")}</div>;
  return (
    <Routes>
      <Route path="/c/:token" element={<PhoneCheckin />} />
      {!session ? (
        <>
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<Login />} />
        </>
      ) : profile?.suspended ? (
        <Route path="*" element={<Login suspended />} />
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          {routes.map(([path, name, module]) => {
            const C = P[name];
            return <Route key={path} path={path} element={<Guard module={module}><Suspense fallback={<div className="empty">…</div>}><C /></Suspense></Guard>} />;
          })}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}
