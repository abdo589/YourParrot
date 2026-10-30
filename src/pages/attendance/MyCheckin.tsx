// "My check-in" for staff: own selfie punch, own attendance and leave requests.
import { Link } from "react-router-dom";
import { functionsUrl, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Empty, useLoad } from "../../components/ui";
import { CheckinWidget, type Punch } from "./CheckinWidget";

export default function MyCheckin() {
  const { profile } = useAuth();
  const { t, fmtDate, fmtDateTime } = useI18n();
  const today = useLoad(async () => {
    const { data } = await supabase.auth.getSession();
    const r = await fetch(`${functionsUrl}/phone-checkin`, { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
    return r.ok ? ((await r.json()).today as Punch[]) : [];
  });
  const days = useLoad(async () => (await supabase.from("attendance_daily").select("*")
    .eq("employee_id", profile?.employee_id ?? "").order("work_date", { ascending: false }).limit(31)).data ?? []);

  if (!profile?.employee_id) {
    return <div className="card"><h1>{t("تسجيل حضوري", "My check-in")}</h1>
      <Empty>{t("حسابك غير مربوط بملف موظف بعد. يتم الربط تلقائيًا بعد تأكيد البريد إذا كان بريدك مسجلًا لدى الموارد البشرية.",
        "Your account isn't linked to an employee record yet. Linking happens automatically after email confirmation if HR has your email.")}</Empty></div>;
  }
  return (
    <>
      <div className="page-head"><h1>{t("تسجيل حضوري", "My check-in")}</h1><Link className="btn" to="/hr/leaves">{t("طلب إجازة", "Request leave")}</Link></div>
      <div className="cols-2">
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CheckinWidget today={today.data ?? []} onDone={() => { today.reload(); days.reload(); }} />
        </div>
        <div className="card flush"><div className="card-head" style={{ padding: 12, margin: 0 }}><h2>{t("آخر 31 يومًا", "Last 31 days")}</h2></div>
          <table className="data"><thead><tr><th>{t("اليوم", "Day")}</th><th>{t("الحضور", "In")}</th><th>{t("الانصراف", "Out")}</th><th /></tr></thead>
            <tbody>{((days.data ?? []) as any[]).map((d) => <tr key={d.work_date}><td>{fmtDate(d.work_date)}</td><td>{fmtDateTime(d.first_in)}</td>
              <td>{fmtDateTime(d.last_out)}</td><td>{d.is_late && <span className="badge danger">{t("متأخر", "Late")}</span>}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}
