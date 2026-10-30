// Leaves: requests, balances, and approvals (Aisha / CEO only — enforced in the DB).
import { useState } from "react";
import { CrudPage } from "../../components/CrudPage";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { Tabs, useToast } from "../../components/ui";
import { LEAVE_TYPES } from "./fields";

const STATUS = [
  { value: "pending", ar: "قيد الاعتماد", en: "Pending", tone: "warn" },
  { value: "approved", ar: "معتمدة", en: "Approved", tone: "ok" },
  { value: "rejected", ar: "مرفوضة", en: "Rejected", tone: "danger" },
  { value: "cancelled", ar: "ملغاة", en: "Cancelled", tone: "" },
];

export default function Leaves() {
  const { profile, can } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<"requests" | "balances">("requests");
  const approver = !!profile?.can_approve_leaves;
  const hr = can("leaves", true);

  const decide = async (id: string, status: string, reload: () => void) => {
    const { error } = await supabase.from("leaves").update({ status }).eq("id", id);
    if (error) toast.error(error); else { toast.ok(t("تم", "Done")); reload(); }
  };

  return (
    <>
      <div className="page-head"><h1>{t("الإجازات", "Leaves")}</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "requests", label: t("الطلبات", "Requests") },
        { id: "balances", label: t("الأرصدة", "Balances"), hidden: !can("leaves") && !approver },
      ]} />
      {tab === "requests" ? (
        <CrudPage table="leaves" module="leaves" canWrite={hr || !!profile?.employee_id} title={{ ar: "طلبات الإجازة", en: "Leave requests" }}
          select="*, employees(full_name)" orderBy={{ column: "start_date" }}
          defaults={() => ({ leave_type: "annual", employee_id: hr ? null : profile?.employee_id })}
          fields={[
            { key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: { table: "employees", label: "full_name" }, required: true, hideInForm: !hr,
              render: (r) => r.employees?.full_name, pdf: (r) => r.employees?.full_name },
            { key: "leave_type", ar: "النوع", en: "Type", type: "select", options: LEAVE_TYPES, required: true },
            { key: "start_date", ar: "من", en: "From", type: "date", required: true },
            { key: "end_date", ar: "إلى", en: "To", type: "date", required: true },
            { key: "days", ar: "الأيام", en: "Days", type: "number", readOnly: true },
            { key: "status", ar: "الحالة", en: "Status", type: "select", options: STATUS, readOnly: true },
            { key: "reason", ar: "السبب", en: "Reason", type: "textarea" },
            { key: "decided_at", ar: "تاريخ القرار", en: "Decided", type: "datetime", readOnly: true, hideInTable: true },
          ]}
          rowActions={(r, reload) => <>
            {approver && r.status === "pending" && <>
              <button className="sm" style={{ color: "var(--ok)" }} onClick={() => decide(r.id, "approved", reload)}>✓ {t("اعتماد", "Approve")}</button>
              <button className="sm danger" onClick={() => decide(r.id, "rejected", reload)}>✕ {t("رفض", "Reject")}</button></>}
            {r.status === "pending" && (hr || r.employee_id === profile?.employee_id) &&
              <button className="sm" onClick={() => decide(r.id, "cancelled", reload)}>{t("إلغاء", "Cancel")}</button>}
          </>} />
      ) : (
        <CrudPage table="leave_balances" module="leaves" canWrite={false} title={{ ar: "أرصدة الإجازات", en: "Leave balances" }}
          orderBy={{ column: "full_name", ascending: true }} fields={[
            { key: "full_name", ar: "الموظف", en: "Employee" },
            { key: "hire_date", ar: "تاريخ التعيين", en: "Hire date", type: "date" },
            { key: "annual_leave_days", ar: "الاستحقاق السنوي", en: "Annual entitlement", type: "number" },
            { key: "accrued", ar: "المستحق حتى اليوم", en: "Accrued to date", type: "number" },
            { key: "used", ar: "المستخدم", en: "Used", type: "number" },
            { key: "balance", ar: "الرصيد", en: "Balance", type: "number" },
          ]} />
      )}
    </>
  );
}
