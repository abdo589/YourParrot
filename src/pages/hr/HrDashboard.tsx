import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useI18n, todayISO } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { Kpi, useLoad } from "../../components/ui";

export default function HrDashboard() {
  const { t, fmtDate } = useI18n();
  const today = todayISO();
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const { data } = useLoad(async () => {
    const [emp, onLeave, pending, iqama, late, reviews] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("leaves").select("id, employees(full_name), end_date").eq("status", "approved").lte("start_date", today).gte("end_date", today),
      supabase.from("leaves").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("residencies").select("id, holder_name, expiry_date, employees(full_name)").lte("expiry_date", in60).order("expiry_date"),
      supabase.from("attendance_daily").select("full_name, first_in").eq("work_date", today).eq("is_late", true),
      supabase.from("performance_reviews").select("overall"),
    ]);
    const avg = (reviews.data ?? []).reduce((s, r) => s + Number(r.overall), 0) / Math.max(1, reviews.data?.length ?? 0);
    return { emp: emp.count ?? 0, onLeave: onLeave.data ?? [], pending: pending.count ?? 0, iqama: iqama.data ?? [], late: late.data ?? [], avg };
  });
  const d = data;
  return (
    <>
      <div className="page-head"><h1>{t("لوحة الموارد البشرية", "HR dashboard")}</h1></div>
      {d && <>
        <div className="kpis">
          <Kpi label={t("الموظفون النشطون", "Active employees")} value={d.emp} />
          <Kpi label={t("في إجازة اليوم", "On leave today")} value={d.onLeave.length} />
          <Kpi label={t("طلبات إجازة معلقة", "Pending leave requests")} value={<Link to="/hr/leaves">{d.pending}</Link>} tone="accent" />
          <Kpi label={t("متأخرون اليوم", "Late today")} value={d.late.length} tone={d.late.length ? "danger" : undefined} />
          <Kpi label={t("إقامات تنتهي خلال 60 يومًا", "Iqamas expiring ≤60d")} value={d.iqama.length} tone={d.iqama.length ? "danger" : undefined} />
          <Kpi label={t("متوسط تقييم الأداء", "Avg. performance")} value={d.avg ? d.avg.toFixed(2) + " / 5" : "—"} />
        </div>
        <div className="cols-2">
          <div className="card"><h2>{t("الإقامات القريبة من الانتهاء", "Iqamas expiring soon")}</h2>
            <table className="data"><tbody>{d.iqama.map((r: any) => <tr key={r.id}><td><Tx>{r.employees?.full_name ?? r.holder_name}</Tx></td>
              <td className={r.expiry_date < today ? "red" : ""}>{fmtDate(r.expiry_date)}</td></tr>)}</tbody></table></div>
          <div className="card"><h2>{t("المتأخرون اليوم (بعد 09:30)", "Late today (after 09:30)")}</h2>
            <table className="data"><tbody>{d.late.map((r: any, i: number) => <tr key={i}><td><Tx>{r.full_name}</Tx></td>
              <td>{new Date(r.first_in).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}</td></tr>)}</tbody></table></div>
        </div>
      </>}
    </>
  );
}
