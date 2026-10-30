// Periodic project reports: weekly (Monday-start) or monthly. Includes every
// project whose dates overlap the period; figures are the current cumulative
// snapshot, not deltas for the period.
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useI18n, todayISO } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf } from "../../lib/pdf";
import { Empty, ErrorBox, Kpi, Progress, useLoad } from "../../components/ui";
import { STATUS_OPTIONS } from "./fields";

export function weekRange(anchor: string) {
  const d = new Date(anchor + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const from = new Date(d); from.setUTCDate(d.getUTCDate() - dow);
  const to = new Date(from); to.setUTCDate(from.getUTCDate() + 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
export function monthRange(anchor: string) {
  const [y, m] = anchor.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: `${y}-${String(m).padStart(2, "0")}-${last}` };
}

export default function ProjectReports() {
  const { t, lang, fmtMoney, fmtDate, fmtNum } = useI18n();
  const [kind, setKind] = useState<"weekly" | "monthly">("weekly");
  const [anchor, setAnchor] = useState(todayISO());
  const range = useMemo(() => (kind === "weekly" ? weekRange(anchor) : monthRange(anchor)), [kind, anchor]);
  const { data, error, loading } = useLoad(async () => {
    const r = await supabase.rpc("projects_in_period", { p_from: range.from, p_to: range.to });
    if (r.error) throw r.error;
    return r.data as Record<string, any>[];
  }, [range.from, range.to]);
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.contract_value), 0);
  const recv = rows.reduce((s, r) => s + Number(r.received), 0);
  const status = (v: string) => { const o = STATUS_OPTIONS.find((x) => x.value === v); return o ? (lang === "ar" ? o.ar : o.en) : v; };
  const title = kind === "weekly" ? t("التقرير الأسبوعي للمشاريع", "Weekly projects report") : t("التقرير الشهري للمشاريع", "Monthly projects report");
  const period = `${fmtDate(range.from)} — ${fmtDate(range.to)}`;

  const pdf = () => exportPdf({
    title, subtitle: period, lang, filename: `projects-${kind}-${range.from}`,
    facts: [[t("عدد المشاريع", "Projects"), String(rows.length)], [t("إجمالي العقود", "Contracts"), fmtMoney(total)],
      [t("إجمالي المستلم", "Received"), fmtMoney(recv)], [t("المتبقي", "Outstanding"), fmtMoney(total - recv)],
      [t("ملاحظة", "Note"), t("الأرقام لقطة تراكمية حالية", "Figures are current cumulative snapshots")]],
    sections: [{
      columns: [
        { header: t("المشروع", "Project"), value: (r) => r.name as string },
        { header: t("العميل", "Client"), value: (r) => r.client as string },
        { header: t("مدير المشروع", "PM"), value: (r) => r.project_manager as string },
        { header: t("قيمة العقد", "Contract"), value: (r) => fmtMoney(r.contract_value as number) },
        { header: t("المستلم", "Received"), value: (r) => fmtMoney(r.received as number) },
        { header: t("الإنجاز", "Progress"), value: (r) => `${fmtNum(r.progress as number, 1)}%` },
        { header: t("الحالة", "Status"), value: (r) => status(r.status as string) },
        { header: t("البداية", "Start"), value: (r) => fmtDate(r.start_date as string) },
        { header: t("النهاية", "End"), value: (r) => fmtDate(r.end_date as string) },
      ], rows, totals: ["", "", "", fmtMoney(total), fmtMoney(recv), "", "", "", ""].map((v, i) => (i === 0 ? t("الإجمالي", "Total") : v)),
    }],
  });

  return (
    <>
      <div className="page-head"><h1>{t("تقارير المشاريع الدورية", "Periodic project reports")}</h1>
        <div className="toolbar">
          <select value={kind} onChange={(e) => setKind(e.target.value as "weekly")} style={{ width: 140 }}>
            <option value="weekly">{t("أسبوعي (من الإثنين)", "Weekly (Mon start)")}</option>
            <option value="monthly">{t("شهري", "Monthly")}</option>
          </select>
          {kind === "weekly" ? <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} style={{ width: 170 }} />
            : <input type="month" value={anchor.slice(0, 7)} onChange={(e) => setAnchor(e.target.value + "-01")} style={{ width: 170 }} />}
          <button className="primary" onClick={pdf} disabled={!rows.length}>⬇ PDF</button>
        </div>
      </div>
      <p className="muted">{period} · {t("المشاريع التي تتداخل تواريخها مع الفترة؛ الأرقام لقطة تراكمية حالية.", "Projects overlapping the period; figures are current cumulative snapshots.")}</p>
      <ErrorBox error={error} />
      <div className="kpis">
        <Kpi label={t("المشاريع", "Projects")} value={rows.length} />
        <Kpi label={t("إجمالي العقود", "Contracts")} value={fmtMoney(total)} tone="accent" />
        <Kpi label={t("المستلم", "Received")} value={fmtMoney(recv)} />
        <Kpi label={t("المتبقي", "Outstanding")} value={fmtMoney(total - recv)} tone="danger" />
      </div>
      <div className="card flush"><div className="table-wrap">
        {loading ? <Empty>…</Empty> : !rows.length ? <Empty /> : <table className="data">
          <thead><tr><th>{t("المشروع", "Project")}</th><th>{t("العميل", "Client")}</th><th>{t("قيمة العقد", "Contract")}</th>
            <th>{t("المستلم", "Received")}</th><th>{t("الإنجاز", "Progress")}</th><th>{t("الحالة", "Status")}</th><th>{t("الفترة", "Dates")}</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><Tx>{r.name}</Tx></td><td><Tx>{r.client}</Tx></td>
            <td className="num">{fmtMoney(r.contract_value)}</td><td className="num">{fmtMoney(r.received)}</td>
            <td><Progress value={r.progress} /></td><td>{status(r.status)}</td><td>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td></tr>)}</tbody>
        </table>}
      </div></div>
    </>
  );
}
