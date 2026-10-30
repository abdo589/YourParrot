// "My projects" for self-signup project managers: private projects,
// reports and files. Admins can read everyone's (my_projects_all).
import { useState } from "react";
import { signedUrl, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { exportPdf } from "../../lib/pdf";
import { CrudPage, type Row } from "../../components/CrudPage";
import { Modal, useLoad, useToast } from "../../components/ui";

export default function MyProjects() {
  const { can, session } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState<Row | null>(null);
  const mine = can("my_projects", true);
  return (
    <>
      <CrudPage table="my_projects" module="my_projects" canWrite={mine} title={{ ar: "مشاريعي", en: "My projects" }}
        filter={(q) => (mine ? q.eq("owner_id", session!.user.id) : q)} filterKey={String(mine)}
        orderBy={{ column: "created_at" }} defaults={{ status: "active", progress: 0 }}
        rowActions={(r) => <button className="sm primary" onClick={() => setOpen(r)}>{t("التقارير والملفات", "Reports & files")}</button>}
        fields={[
          { key: "name", ar: "المشروع", en: "Project", required: true },
          { key: "client", ar: "العميل", en: "Client" },
          { key: "location", ar: "الموقع", en: "Location" },
          { key: "start_date", ar: "البداية", en: "Start", type: "date" },
          { key: "end_date", ar: "النهاية", en: "End", type: "date" },
          { key: "status", ar: "الحالة", en: "Status", type: "lookup", lookup: "project_status" },
          { key: "progress", ar: "الإنجاز", en: "Progress", type: "percent" },
          { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
          ...(!mine ? [{ key: "owner_id", ar: "المالك", en: "Owner", type: "ref" as const, readOnly: true, ref: { table: "directory", label: "full_name" } }] : []),
        ]} />
      {open && <ProjectPanel project={open} canWrite={mine && open.owner_id === session!.user.id} onClose={() => setOpen(null)} />}
    </>
  );
}

function ProjectPanel({ project, canWrite, onClose }: { project: Row; canWrite: boolean; onClose: () => void }) {
  const { t, lang, fmtDate, fmtDateTime } = useI18n();
  const { session } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState({ title: "", body: "", report_date: new Date().toISOString().slice(0, 10) });
  const reports = useLoad(async () => (await supabase.from("my_project_reports").select("*").eq("project_id", project.id).order("report_date", { ascending: false })).data ?? [], [project.id]);
  const files = useLoad(async () => (await supabase.from("my_project_files").select("*").eq("project_id", project.id).order("created_at", { ascending: false })).data ?? [], [project.id]);
  const addReport = async () => {
    const { error } = await supabase.from("my_project_reports").insert({ ...draft, project_id: project.id, owner_id: session!.user.id });
    if (error) toast.error(error); else { setDraft({ ...draft, title: "", body: "" }); reports.reload(); }
  };
  const upload = async (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      const path = `${session!.user.id}/${project.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("my-projects").upload(path, f);
      if (up.error) { toast.error(up.error); continue; }
      await supabase.from("my_project_files").insert({ project_id: project.id, owner_id: session!.user.id, file_path: path, file_name: f.name });
    }
    files.reload();
  };
  const pdf = () => exportPdf({
    title: project.name, subtitle: t("تقارير المشروع", "Project reports"), lang, orientation: "portrait", filename: `my-project-${project.name}`,
    facts: [[t("العميل", "Client"), project.client ?? ""], [t("الإنجاز", "Progress"), `${project.progress}%`]],
    sections: [{ rows: (reports.data ?? []) as Row[], columns: [{ header: t("التاريخ", "Date"), value: (r) => fmtDate(r.report_date as string) },
      { header: t("العنوان", "Title"), value: (r) => r.title as string }, { header: t("التفاصيل", "Details"), value: (r) => r.body as string }] }],
  });
  return (
    <Modal wide title={project.name} onClose={onClose} footer={<button onClick={pdf}>⬇ PDF</button>}>
      <div className="cols-2">
        <div>
          <h3>{t("التقارير", "Reports")}</h3>
          {canWrite && <div className="form-grid" style={{ margin: "8px 0" }}>
            <input type="date" value={draft.report_date} onChange={(e) => setDraft({ ...draft, report_date: e.target.value })} />
            <input placeholder={t("العنوان", "Title")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <textarea style={{ gridColumn: "1 / -1" }} placeholder={t("التفاصيل", "Details")} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <button className="primary" disabled={!draft.title} onClick={addReport}>＋ {t("إضافة تقرير", "Add report")}</button></div>}
          {(reports.data as Row[] ?? []).map((r) => <div key={r.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
            <b><Tx>{r.title}</Tx></b> <small className="muted">{fmtDate(r.report_date)}</small><div style={{ whiteSpace: "pre-wrap" }}><Tx>{r.body}</Tx></div></div>)}
        </div>
        <div>
          <div className="card-head"><h3 style={{ flex: 1 }}>{t("الملفات الخاصة", "Private files")}</h3>
            {canWrite && <label className="btn sm">⬆ {t("رفع", "Upload")}<input type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label>}</div>
          <table className="data"><tbody>{(files.data as Row[] ?? []).map((f) => <tr key={f.id}><td>{f.file_name}</td><td className="muted">{fmtDateTime(f.created_at)}</td>
            <td className="actions"><button className="sm" onClick={async () => window.open(await signedUrl("my-projects", f.file_path, 300), "_blank", "noopener")}>{t("فتح", "Open")}</button></td></tr>)}</tbody></table>
        </div>
      </div>
    </Modal>
  );
}
