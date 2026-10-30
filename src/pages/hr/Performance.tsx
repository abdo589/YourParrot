import { CrudPage } from "../../components/CrudPage";

const score = (key: string, ar: string, en: string) => ({ key, ar: `${ar} (1-5)`, en: `${en} (1-5)`, type: "number" as const });

export default function Performance() {
  return <CrudPage table="performance_reviews" module="performance" title={{ ar: "تقييم الأداء", en: "Performance reviews" }}
    orderBy={{ column: "created_at" }} fields={[
      { key: "employee_id", ar: "الموظف", en: "Employee", type: "ref", ref: { table: "employees", label: "full_name" }, required: true },
      { key: "period", ar: "الفترة", en: "Period", type: "lookup", lookup: "review_period", required: true },
      score("quality", "الجودة", "Quality"), score("productivity", "الإنتاجية", "Productivity"),
      score("teamwork", "العمل الجماعي", "Teamwork"), score("attendance", "الانضباط", "Attendance"),
      { key: "overall", ar: "الإجمالي", en: "Overall", type: "number", readOnly: true },
      { key: "comments", ar: "ملاحظات", en: "Comments", type: "textarea" },
    ]} />;
}
