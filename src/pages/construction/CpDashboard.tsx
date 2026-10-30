import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { Kpi, useLoad } from "../../components/ui";

export default function CpDashboard() {
  const { t, fmtMoney, fmtDate } = useI18n();
  const { data } = useLoad(async () => {
    const [d, late, inv, totals] = await Promise.all([
      supabase.from("cp_dashboard").select("*").single(),
      supabase.from("submissions_view").select("id, ref_no, title, waiting_days, project_id, cp_projects(code)").eq("is_late", true).eq("superseded", false).order("waiting_days", { ascending: false }).limit(15),
      supabase.from("cp_invoices_view").select("id, invoice_no, net_amount, submitted_on, days_unpaid, project_id, cp_projects(code)").eq("overdue", true).limit(15),
      supabase.from("cp_project_totals").select("*"),
    ]);
    return { d: d.data as Record<string, number>, late: late.data ?? [], inv: inv.data ?? [], totals: totals.data ?? [] };
  });
  if (!data) return null;
  const { d } = data;
  const codes = [["A", d.code_a], ["B", d.code_b], ["C", d.code_c], ["D", d.code_d]] as const;
  const max = Math.max(1, ...codes.map(([, n]) => n));
  return (
    <>
      <div className="page-head"><h1>{t("إدارة مشاريع — لوحة التحكم", "Project Admin — dashboard")}</h1></div>
      <div className="kpis">
        <Kpi label={t("مشاريع جارية", "Active projects")} value={d.active_projects} tone="accent" />
        <Kpi label={t("الأعضاء", "Members")} value={d.members} />
        <Kpi label={t("مستندات معلقة", "Pending documents")} value={d.pending_docs} />
        <Kpi label={t("مستندات متأخرة (+7 أيام)", "Late documents (>7d)")} value={d.late_docs} tone="danger" />
        <Kpi label={t("مستخلصات معلقة", "Pending invoices")} value={d.pending_invoices} />
        <Kpi label={t("مستخلصات متأخرة (+30 يوم)", "Late invoices (>30d)")} value={d.late_invoices} tone="danger" />
      </div>
      <div className="cols-2">
        <div className="card"><h2>{t("أكواد المستندات", "Document codes")}</h2>
          <div className="hbars" style={{ marginTop: 12 }}>{codes.map(([c, n]) => <div key={c}>
            <span className={`badge code-${c}`}>{c}</span>
            <div className="bar" style={{ height: 14 }}><i style={{ width: `${(n / max) * 100}%`, background: `var(--${c === "A" ? "ok" : c === "B" ? "info" : c === "C" ? "warn" : "danger"})` }} /></div>
            <b>{n}</b></div>)}</div></div>
        <div className="card"><h2>{t("المشاريع: العقد / المستخلص / المدفوع", "Projects: contract / invoiced / paid")}</h2>
          <table className="data"><tbody>{(data.totals as any[]).map((p) => <tr key={p.project_id}>
            <td><Link to={`/cp/projects/${p.project_id}`}>{p.code}</Link> <Tx>{p.name}</Tx></td>
            <td className="num">{fmtMoney(p.contract_value)}</td><td className="num">{fmtMoney(p.invoiced)}</td><td className="num">{fmtMoney(p.paid)}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>{t("مستندات متأخرة", "Late documents")}</h2>
          <table className="data"><tbody>{(data.late as any[]).map((s) => <tr key={s.id}>
            <td><Link to={`/cp/projects/${s.project_id}?tab=documents`}>{s.ref_no}</Link></td><td><Tx>{s.title}</Tx></td>
            <td className="red">{s.waiting_days} {t("يوم", "d")}</td></tr>)}</tbody></table></div>
        <div className="card"><h2>{t("مستخلصات بدون صرف +30 يوم", "Invoices unpaid >30 days")}</h2>
          <table className="data"><tbody>{(data.inv as any[]).map((i) => <tr key={i.id}>
            <td><Link to={`/cp/projects/${i.project_id}?tab=invoices`}>{i.cp_projects?.code} #{i.invoice_no}</Link></td>
            <td className="num">{fmtMoney(i.net_amount)}</td><td>{fmtDate(i.submitted_on)}</td><td className="red">{i.days_unpaid} {t("يوم", "d")}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}
