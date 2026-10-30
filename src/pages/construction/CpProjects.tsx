import { Link } from "react-router-dom";
import { CrudPage } from "../../components/CrudPage";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { CP_STATUS } from "./shared";

export default function CpProjects() {
  const { t } = useI18n();
  const { can, session } = useAuth();
  return (
    <CrudPage table="cp_projects" module="construction" canWrite={can("construction", true)} title={{ ar: "مشاريع المقاولات", en: "Construction projects" }}
      orderBy={{ column: "created_at" }} defaults={{ status: "planning" }}
      // the creator becomes the project's admin member
      onSaved={(r) => { supabase.from("project_members").upsert({ project_id: r.id, user_id: session!.user.id, role: "admin" }).then(() => undefined); }}
      rowActions={(r) => <Link className="btn sm primary" to={`/cp/projects/${r.id}`}>{t("فتح", "Open")}</Link>}
      fields={[
        { key: "code", ar: "الكود", en: "Code", required: true },
        { key: "name", ar: "المشروع", en: "Project", required: true },
        { key: "client", ar: "العميل", en: "Client" },
        { key: "location", ar: "الموقع", en: "Location" },
        { key: "start_date", ar: "البداية", en: "Start", type: "date" },
        { key: "end_date", ar: "النهاية", en: "End", type: "date" },
        { key: "status", ar: "الحالة", en: "Status", type: "select", options: CP_STATUS, required: true },
        { key: "description", ar: "الوصف", en: "Description", type: "textarea", hideInTable: true },
      ]} />
  );
}
