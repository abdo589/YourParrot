// Employee file: details, private documents (contract, job offer, work start)
// in the private hr-files bucket, and the secret phone check-in link.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { signedUrl, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { ErrorBox, must, useLoad, useToast } from "../../components/ui";
import { EMPLOYEE_FIELDS } from "./fields";
import { useFormat, useRefOptions } from "../../components/CrudPage";

const KINDS = [
  { v: "contract", ar: "عقد العمل", en: "Employment contract" },
  { v: "job_offer", ar: "العرض الوظيفي", en: "Job offer" },
  { v: "work_start", ar: "مباشرة العمل", en: "Work start" },
  { v: "other", ar: "أخرى", en: "Other" },
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { t, lang, fmtDateTime } = useI18n();
  const toast = useToast();
  const fmt = useFormat();
  const refs = useRefOptions(EMPLOYEE_FIELDS);
  const [kind, setKind] = useState("contract");
  const emp = useLoad(async () => must(await supabase.from("employees").select("*").eq("id", id!).single()), [id]);
  const files = useLoad(async () => must(await supabase.from("employee_files").select("*").eq("employee_id", id!).order("uploaded_at", { ascending: false })), [id]);
  const bal = useLoad(async () => (await supabase.from("leave_balances").select("*").eq("employee_id", id!).maybeSingle()).data, [id]);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    const path = `${id}/${kind}-${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const up = await supabase.storage.from("hr-files").upload(path, f);
    if (up.error) return toast.error(up.error);
    const { error } = await supabase.from("employee_files").insert({ employee_id: id, kind, file_path: path, file_name: f.name });
    if (error) toast.error(error); else { toast.ok(t("تم الرفع", "Uploaded")); files.reload(); }
  };
  const open = async (path: string) => { try { window.open(await signedUrl("hr-files", path, 300), "_blank", "noopener"); } catch (e) { toast.error(e); } };
  const remove = async (f: any) => {
    if (!confirm(t("حذف الملف؟", "Delete file?"))) return;
    await supabase.storage.from("hr-files").remove([f.file_path]);
    const { error } = await supabase.from("employee_files").delete().eq("id", f.id);
    if (error) toast.error(error); else files.reload();
  };
  const e = emp.data as Record<string, any> | null;
  const link = e ? `${location.origin}/c/${e.checkin_token}` : "";

  return (
    <>
      <ErrorBox error={emp.error} />
      {e && <>
        <div className="page-head"><h1><Tx>{e.full_name}</Tx></h1>
          {bal.data && <span className="badge info">{t("رصيد الإجازة", "Leave balance")}: {(bal.data as any).balance} {t("يوم", "days")}</span>}</div>
        <div className="card"><div className="form-grid">
          {EMPLOYEE_FIELDS.map((f) => <div key={f.key}><small className="muted">{lang === "ar" ? f.ar : f.en}</small><div><Tx>{fmt(f, e, refs) || "—"}</Tx></div></div>)}
        </div></div>
        <div className="card">
          <div className="card-head"><h2>{t("رابط تسجيل الحضور من الجوال", "Phone check-in link")}</h2></div>
          <p className="muted">{t("رابط سري خاص بالموظف، لا يحتاج حسابًا. لا تشاركه مع غيره.", "A secret per-employee link, no account needed. Share only with this employee.")}</p>
          <div style={{ display: "flex", gap: 8 }}><input readOnly value={link} dir="ltr" />
            <button onClick={() => { navigator.clipboard.writeText(link); toast.ok(t("تم النسخ", "Copied")); }}>{t("نسخ", "Copy")}</button></div>
        </div>
        <div className="card">
          <div className="card-head"><h2>{t("ملفات الموظف (خاصة)", "Employee documents (private)")}</h2>
            {can("hr", true) && <div className="toolbar">
              <select value={kind} onChange={(x) => setKind(x.target.value)} style={{ width: 170 }}>
                {KINDS.map((k) => <option key={k.v} value={k.v}>{lang === "ar" ? k.ar : k.en}</option>)}</select>
              <label className="btn primary">⬆ {t("رفع ملف", "Upload")}<input type="file" hidden onChange={(x) => { upload(x.target.files?.[0]); x.target.value = ""; }} /></label>
            </div>}
          </div>
          <table className="data"><tbody>{((files.data ?? []) as any[]).map((f) => (
            <tr key={f.id}><td>{KINDS.find((k) => k.v === f.kind)?.[lang]}</td><td>{f.file_name}</td><td>{fmtDateTime(f.uploaded_at)}</td>
              <td className="actions"><button className="sm" onClick={() => open(f.file_path)}>{t("فتح", "Open")}</button>
                {can("hr", true) && <button className="sm danger" onClick={() => remove(f)}>🗑</button>}</td></tr>))}</tbody></table>
        </div>
      </>}
    </>
  );
}
