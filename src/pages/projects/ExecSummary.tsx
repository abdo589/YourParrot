// Live executive summary (read-only); refreshes on any project/payment/budget change.
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf } from "../../lib/pdf";
import { ErrorBox, Kpi, Progress, useLoad } from "../../components/ui";
import { STATUS_OPTIONS } from "./fields";

export default function ExecSummary() {
  const { t, lang, fmtMoney, fmtNum, fmtDate } = useI18n();
  const sum = useLoad(async () => (await supabase.from("exec_summary").select("*").single()).data);
  const projects = useLoad(async () => (await supabase.from("projects").select("*").is("deleted_at", null).order("contract_value", { ascending: false })).data ?? []);

  useEffect(() => {
    const ch = supabase.channel("exec-live");
    ["projects", "payments", "budget_items"].forEach((table) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => { sum.reload(); projects.reload(); }));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = sum.data as Record<string, number> | null;
  const status = (v: string) => { const o = STATUS_OPTIONS.find((x) => x.value === v); return o ? (lang === "ar" ? o.ar : o.en) : v; };
  const pdf = () => exportPdf({
    title: t("الملخص التنفيذي", "Executive summary"), lang, filename: "executive-summary",
    facts: s ? [
      [t("عدد المشاريع", "Projects"), fmtNum(s.projects_count)], [t("المشاريع الجارية", "Active"), fmtNum(s.active_count)],
      [t("إجمالي العقود", "Contracts total"), fmtMoney(s.contract_total)], [t("إجمالي المستلم", "Received total"), fmtMoney(s.received_total)],
      [t("المتبقي", "Outstanding"), fmtMoney(s.contract_total - s.received_total)], [t("متوسط الإنجاز", "Avg. progress"), `${fmtNum(s.avg_progress, 1)}%`],
      [t("الميزانية المخططة / الفعلية", "Budget planned / actual"), `${fmtMoney(s.budget_planned)} / ${fmtMoney(s.budget_actual)}`],
    ] : [],
    sections: [{
      columns: [
        { header: t("المشروع", "Project"), value: (r) => r.name as string },
        { header: t("العميل", "Client"), value: (r) => r.client as string },
        { header: t("قيمة العقد", "Contract"), value: (r) => fmtMoney(r.contract_value as number) },
        { header: t("المستلم", "Received"), value: (r) => fmtMoney(r.received as number) },
        { header: t("الإنجاز", "Progress"), value: (r) => `${r.progress}%` },
        { header: t("الحالة", "Status"), value: (r) => status(r.status as string) },
        { header: t("النهاية", "End"), value: (r) => fmtDate(r.end_date as string) },
      ], rows: (projects.data ?? []) as Record<string, unknown>[],
    }],
  });

  return (
    <>
      <div className="page-head"><h1>{t("الملخص التنفيذي", "Executive summary")} <span className="badge ok">● {t("مباشر", "Live")}</span></h1>
        <button onClick={pdf}>⬇ PDF</button></div>
      <ErrorBox error={sum.error} />
      {s && <div className="kpis">
        <Kpi label={t("عدد المشاريع", "Projects")} value={fmtNum(s.projects_count)} />
        <Kpi label={t("المشاريع الجارية", "Active projects")} value={fmtNum(s.active_count)} />
        <Kpi label={t("إجمالي العقود", "Contracts total")} value={fmtMoney(s.contract_total)} tone="accent" />
        <Kpi label={t("إجمالي المستلم", "Received")} value={fmtMoney(s.received_total)} />
        <Kpi label={t("المتبقي", "Outstanding")} value={fmtMoney(s.contract_total - s.received_total)} tone="danger" />
        <Kpi label={t("متوسط الإنجاز", "Avg. progress")} value={`${fmtNum(s.avg_progress, 1)}%`} />
        <Kpi label={t("الميزانية المخططة", "Budget planned")} value={fmtMoney(s.budget_planned)} />
        <Kpi label={t("المصروف الفعلي", "Budget actual")} value={fmtMoney(s.budget_actual)} />
        <Kpi label={t("مدفوعات هذا الشهر", "Payments this month")} value={fmtMoney(s.payments_this_month)} />
      </div>}
      <div className="card flush"><div className="table-wrap"><table className="data">
        <thead><tr><th>{t("المشروع", "Project")}</th><th>{t("العميل", "Client")}</th><th>{t("قيمة العقد", "Contract")}</th>
          <th>{t("المستلم", "Received")}</th><th>{t("التحصيل", "Collected")}</th><th>{t("الإنجاز", "Progress")}</th><th>{t("الحالة", "Status")}</th></tr></thead>
        <tbody>{(projects.data as Record<string, any>[] ?? []).map((p) => (
          <tr key={p.id}><td><Tx>{p.name}</Tx></td><td><Tx>{p.client}</Tx></td><td className="num">{fmtMoney(p.contract_value)}</td>
            <td className="num">{fmtMoney(p.received)}</td>
            <td><Progress value={p.contract_value ? Math.round((p.received / p.contract_value) * 100) : 0} /></td>
            <td><Progress value={p.progress} /></td><td>{status(p.status)}</td></tr>))}</tbody>
      </table></div></div>
    </>
  );
}
