// Config-driven list + form + PDF page used by most modules. Writes go
// straight to the table; the database enforces every rule (RLS, versions,
// tombstones, frozen values) and errors are shown in plain language.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { Tx } from "../lib/translate";
import { exportPdf } from "../lib/pdf";
import { SelectOther } from "./SelectOther";
import { Empty, ErrorBox, Modal, Progress, useToast } from "./ui";

export type FieldType = "text" | "number" | "money" | "percent" | "date" | "datetime" | "textarea" | "select"
  | "lookup" | "bool" | "ref" | "email" | "time" | "tags";

export interface Field {
  key: string;
  ar: string;
  en: string;
  type?: FieldType;
  options?: { value: string; ar: string; en: string; tone?: string }[];
  lookup?: string;                                  // lookup_values category
  ref?: { table: string; label: string; filter?: (q: any) => any };
  required?: boolean;
  readOnly?: boolean;                               // computed in the DB
  hideInTable?: boolean;
  hideInForm?: boolean;
  render?: (row: Row) => ReactNode;
  pdf?: (row: Row) => string;
}

export type Row = Record<string, any>;

export interface CrudConfig {
  table: string;
  view?: string;                    // read from a view (e.g. one with computed columns)
  select?: string;
  title: { ar: string; en: string };
  module: string;
  fields: Field[];
  orderBy?: { column: string; ascending?: boolean };
  versioned?: boolean;              // optimistic locking + tombstones
  allowDelete?: boolean;
  filter?: (q: any) => any;
  filterKey?: string;               // change to re-run the query when the filter's inputs change
  defaults?: Row | (() => Row);
  canWrite?: boolean;               // override module-based write check
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  toolbar?: (rows: Row[], reload: () => void) => ReactNode;
  footer?: (rows: Row[]) => ReactNode;
  totals?: string[];                // money/number keys to total in the footer and PDF
  realtime?: boolean;
  onSaved?: (row: Row) => void;
  pageSize?: number;
}

const refCache = new Map<string, Promise<Row[]>>();
function loadRef(ref: NonNullable<Field["ref"]>) {
  const key = ref.table + ":" + ref.label;
  if (!refCache.has(key)) {
    let q = supabase.from(ref.table).select(`id, ${ref.label}`).order(ref.label).limit(2000);
    if (ref.filter) q = ref.filter(q);
    refCache.set(key, Promise.resolve(q).then(({ data }) => (data ?? []) as Row[]));
  }
  return refCache.get(key)!;
}
export function clearRefCache() { refCache.clear(); }

export function useRefOptions(fields: Field[]) {
  const [maps, setMaps] = useState<Record<string, Row[]>>({});
  useEffect(() => {
    fields.filter((f) => f.type === "ref" && f.ref).forEach((f) =>
      loadRef(f.ref!).then((rows) => setMaps((m) => ({ ...m, [f.key]: rows }))));
  }, [fields]);
  return maps;
}

export function useFormat() {
  const { t, lang, fmtDate, fmtDateTime, fmtMoney, fmtNum } = useI18n();
  return (f: Field, row: Row, refs: Record<string, Row[]>): string => {
    const v = row[f.key];
    if (f.pdf) return f.pdf(row);
    if (v === null || v === undefined || v === "") return "";
    switch (f.type) {
      case "money": return fmtMoney(v);
      case "number": return fmtNum(v, 2);
      case "percent": return `${fmtNum(v, 1)}%`;
      case "date": return fmtDate(v);
      case "datetime": return fmtDateTime(v);
      case "bool": return v ? t("نعم", "Yes") : t("لا", "No");
      case "select": { const o = f.options?.find((x) => x.value === v); return o ? (lang === "ar" ? o.ar : o.en) : String(v); }
      case "ref": { const r = refs[f.key]?.find((x) => x.id === v); return r ? String(r[f.ref!.label]) : ""; }
      case "tags": return Array.isArray(v) ? v.join("، ") : String(v);
      default: return String(v);
    }
  };
}

export function FieldInput({ f, value, onChange, refs }: { f: Field; value: any; onChange: (v: any) => void; refs: Record<string, Row[]> }) {
  const { lang } = useI18n();
  switch (f.type) {
    case "textarea": return <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={f.required} />;
    case "bool": return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ width: "auto" }} />;
    case "select": return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} required={f.required}>
        <option value="">—</option>
        {f.options!.map((o) => <option key={o.value} value={o.value}>{lang === "ar" ? o.ar : o.en}</option>)}
      </select>);
    case "lookup": return <SelectOther category={f.lookup!} value={value} onChange={onChange} required={f.required} />;
    case "ref": return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} required={f.required}>
        <option value="">—</option>
        {(refs[f.key] ?? []).map((r) => <option key={r.id} value={r.id}>{r[f.ref!.label]}</option>)}
      </select>);
    case "date": return <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} required={f.required} />;
    case "time": return <input type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} required={f.required} />;
    case "datetime": return <input type="datetime-local" value={value ? String(value).slice(0, 16) : ""}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} required={f.required} />;
    case "number": case "money": case "percent":
      return <input type="number" step="any" inputMode="decimal" value={value ?? ""} required={f.required}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "tags": return <input value={Array.isArray(value) ? value.join(", ") : value ?? ""}
      onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />;
    case "email": return <input type="email" value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={f.required} />;
    default: return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={f.required} />;
  }
}

export function RowForm({ fields, row, setRow, refs }: { fields: Field[]; row: Row; setRow: (r: Row) => void; refs: Record<string, Row[]> }) {
  const { lang } = useI18n();
  return (
    <div className="form-grid">
      {fields.filter((f) => !f.hideInForm && !f.readOnly).map((f) => (
        <label key={f.key} className={`field ${f.type === "textarea" ? "wide" : ""}`}>
          {lang === "ar" ? f.ar : f.en}{f.required && " *"}
          <FieldInput f={f} value={row[f.key]} refs={refs} onChange={(v) => setRow({ ...row, [f.key]: v })} />
        </label>
      ))}
    </div>
  );
}

export function CrudPage(c: CrudConfig) {
  const { t, lang, fmtMoney, fmtNum } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const fmt = useFormat();
  const refs = useRefOptions(c.fields);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState(c.pageSize ?? 200);
  const writable = c.canWrite ?? can(c.module, true);

  const load = async () => {
    setLoading(true);
    let query = supabase.from(c.view ?? c.table).select(c.select ?? "*");
    if (c.versioned) query = query.is("deleted_at", null);
    if (c.filter) query = c.filter(query);
    if (c.orderBy) query = query.order(c.orderBy.column, { ascending: c.orderBy.ascending ?? false });
    const { data, error } = await query.limit(limit);
    setError(error); setRows((data ?? []) as Row[]); setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [c.table, c.view, limit, c.filterKey]);

  useEffect(() => {
    if (!c.realtime) return;
    const ch = supabase.channel(`rt-${c.table}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: c.table }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.table, c.realtime]);

  const tableFields = c.fields.filter((f) => !f.hideInTable);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => tableFields.some((f) => fmt(f, r, refs).toLowerCase().includes(s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, refs, lang]);

  const totals = (c.totals ?? []).reduce<Record<string, number>>((acc, k) => {
    acc[k] = filtered.reduce((s, r) => s + (Number(r[k]) || 0), 0); return acc;
  }, {});

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const payload: Row = {};
    c.fields.filter((f) => !f.readOnly).forEach((f) => { if (f.key in editing) payload[f.key] = editing[f.key]; });
    let res;
    if (editing.id) {
      if (c.versioned) payload.version = editing.version;     // DB compares and increments
      res = await supabase.from(c.table).update(payload).eq("id", editing.id).select().maybeSingle();
    } else {
      res = await supabase.from(c.table).insert(payload).select().maybeSingle();
    }
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    if (!res.data) { toast.error({ message: "FORBIDDEN" }); return; }
    toast.ok(t("تم الحفظ", "Saved"));
    setEditing(null);
    c.onSaved?.(res.data);
    load();
  };

  const remove = async (r: Row) => {
    if (!confirm(t("تأكيد الحذف؟", "Delete this record?"))) return;
    const res = c.versioned
      ? await supabase.from(c.table).update({ deleted_at: new Date().toISOString(), version: r.version }).eq("id", r.id)
      : await supabase.from(c.table).delete().eq("id", r.id);
    if (res.error) toast.error(res.error); else { toast.ok(t("تم الحذف", "Deleted")); load(); }
  };

  const pdf = () => exportPdf({
    title: lang === "ar" ? c.title.ar : c.title.en,
    subtitle: q ? `${t("بحث", "Filter")}: ${q}` : undefined,
    lang,
    filename: `${c.table}-${new Date().toISOString().slice(0, 10)}`,
    sections: [{
      columns: tableFields.map((f) => ({ header: lang === "ar" ? f.ar : f.en, value: (r) => fmt(f, r, refs) })),
      rows: filtered,
      totals: c.totals?.length ? tableFields.map((f, i) => (f.key in totals
        ? (f.type === "money" ? fmtMoney(totals[f.key]) : fmtNum(totals[f.key], 2))
        : i === 0 ? t("الإجمالي", "Total") : "")) : undefined,
    }],
  });

  const defaults = () => (typeof c.defaults === "function" ? c.defaults() : c.defaults ?? {});

  return (
    <div className="card flush">
      <div className="card-head" style={{ padding: "12px 14px", margin: 0, borderBottom: "1px solid var(--border)" }}>
        <h2>{lang === "ar" ? c.title.ar : c.title.en} <small className="muted">({filtered.length})</small></h2>
        <div className="toolbar">
          <input type="search" placeholder={t("بحث…", "Search…")} value={q} onChange={(e) => setQ(e.target.value)} />
          {c.toolbar?.(filtered, load)}
          <button onClick={pdf} disabled={!filtered.length}>⬇ PDF</button>
          {writable && <button className="primary" onClick={() => setEditing(defaults())}>＋ {t("إضافة", "Add")}</button>}
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="table-wrap">
        {loading ? <Empty>{t("جارٍ التحميل…", "Loading…")}</Empty> : !filtered.length ? <Empty /> : (
          <table className="data">
            <thead><tr>{tableFields.map((f) => <th key={f.key}>{lang === "ar" ? f.ar : f.en}</th>)}<th /></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id ?? JSON.stringify(r)}>
                  {tableFields.map((f) => <td key={f.key} className={["money", "number", "percent"].includes(f.type ?? "") ? "num" : ""}>
                    <Cell f={f} row={r} text={fmt(f, r, refs)} />
                  </td>)}
                  <td className="actions">
                    {c.rowActions?.(r, load)}
                    <button className="ghost icon" title={t("عرض", "View")} onClick={() => setViewing(r)}>👁</button>
                    {writable && r.id && <button className="ghost icon" title={t("تعديل", "Edit")} onClick={() => setEditing({ ...r })}>✎</button>}
                    {writable && c.allowDelete !== false && r.id && <button className="ghost icon danger" title={t("حذف", "Delete")} onClick={() => remove(r)}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            {c.totals?.length ? (
              <tfoot><tr>{tableFields.map((f, i) => <td key={f.key} className="num">
                {f.key in totals ? (f.type === "money" ? fmtMoney(totals[f.key]) : fmtNum(totals[f.key], 2)) : i === 0 ? t("الإجمالي", "Total") : ""}
              </td>)}<td /></tr></tfoot>
            ) : null}
          </table>
        )}
      </div>
      {rows.length >= limit && <div style={{ padding: 10, textAlign: "center" }}><button onClick={() => setLimit(limit * 2)}>{t("تحميل المزيد", "Load more")}</button></div>}
      {c.footer?.(filtered)}

      {editing && (
        <Modal title={editing.id ? t("تعديل", "Edit") : t("إضافة", "Add")} onClose={() => setEditing(null)}
          footer={<><button onClick={() => setEditing(null)}>{t("إلغاء", "Cancel")}</button>
            <button className="primary" disabled={saving} onClick={save}>{saving ? "…" : t("حفظ", "Save")}</button></>}>
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <RowForm fields={c.fields} row={editing} setRow={setEditing} refs={refs} />
          </form>
        </Modal>
      )}
      {viewing && (
        <Modal title={t("تفاصيل", "Details")} onClose={() => setViewing(null)}>
          <table className="data"><tbody>
            {c.fields.map((f) => <tr key={f.key}><th style={{ width: "35%" }}>{lang === "ar" ? f.ar : f.en}</th>
              <td><Cell f={f} row={viewing} text={fmt(f, viewing, refs)} /></td></tr>)}
          </tbody></table>
        </Modal>
      )}
    </div>
  );
}

function Cell({ f, row, text }: { f: Field; row: Row; text: string }) {
  if (f.render) return <>{f.render(row)}</>;
  if (f.key === "progress") return <Progress value={row.progress} />;
  if (f.type === "select") {
    const o = f.options?.find((x) => x.value === row[f.key]);
    return o?.tone ? <span className={`badge ${o.tone}`}>{text}</span> : <>{text}</>;
  }
  if (!f.type || f.type === "text" || f.type === "textarea" || f.type === "lookup" || f.type === "ref") return <Tx>{text}</Tx>;
  return <>{text}</>;
}
