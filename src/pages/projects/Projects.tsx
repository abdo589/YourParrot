import { CrudPage } from "../../components/CrudPage";
import { PROJECT_FIELDS } from "./fields";

export default function Projects() {
  return (
    <CrudPage table="projects" module="projects" title={{ ar: "المشاريع", en: "Projects" }}
      fields={PROJECT_FIELDS} versioned realtime orderBy={{ column: "created_at" }}
      defaults={{ status: "active", progress: 0 }} totals={["contract_value", "received"]} />
  );
}
