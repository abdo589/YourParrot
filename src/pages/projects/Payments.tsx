import { CrudPage } from "../../components/CrudPage";
import { projectRef } from "./fields";

export default function Payments() {
  return (
    <CrudPage table="payments" module="payments" title={{ ar: "المدفوعات", en: "Payments" }} versioned realtime
      orderBy={{ column: "receipt_no" }} totals={["amount"]} defaults={() => ({ paid_on: new Date().toISOString().slice(0, 10) })}
      fields={[
        { key: "receipt_no", ar: "رقم الإيصال", en: "Receipt #", readOnly: true },
        { key: "project_id", ar: "المشروع", en: "Project", type: "ref", ref: projectRef, required: true },
        { key: "amount", ar: "المبلغ", en: "Amount", type: "money", required: true },
        { key: "paid_on", ar: "التاريخ", en: "Date", type: "date", required: true },
        { key: "method", ar: "طريقة الدفع", en: "Method", type: "lookup", lookup: "payment_method" },
        { key: "reference", ar: "المرجع", en: "Reference" },
        { key: "payer", ar: "الدافع", en: "Payer" },
        { key: "notes", ar: "ملاحظات", en: "Notes", type: "textarea", hideInTable: true },
      ]} />
  );
}
