import { Link } from "react-router-dom";
import { CrudPage } from "../../components/CrudPage";
import { useI18n } from "../../lib/i18n";
import { EMPLOYEE_FIELDS } from "./fields";

export default function Employees() {
  const { t } = useI18n();
  return (
    <CrudPage table="employees" module="hr" title={{ ar: "الموظفون", en: "Employees" }} fields={EMPLOYEE_FIELDS}
      orderBy={{ column: "full_name", ascending: true }} defaults={{ status: "active", annual_leave_days: 30 }} allowDelete={false}
      rowActions={(r) => <Link className="btn sm" to={`/hr/employees/${r.id}`}>{t("الملف", "File")}</Link>} />
  );
}
