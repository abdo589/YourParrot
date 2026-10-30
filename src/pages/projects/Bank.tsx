import { useState } from "react";
import { CrudPage } from "../../components/CrudPage";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { callFn } from "../../lib/supabase";
import { useToast } from "../../components/ui";

export default function Bank() {
  const { can } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await callFn<{ updated: number }>("bank-refresh", {});
      toast.ok(t(`تم تحديث ${r.updated} حساب`, `Updated ${r.updated} account(s)`)); setKey(key + 1);
    } catch (e) {
      const m = (e as Error).message;
      toast.error(m === "no_bank_feed_configured" ? t("لم يتم إعداد ربط البنك (BANK_FEED_URL).", "No bank feed configured (BANK_FEED_URL).") : e);
    }
    setBusy(false);
  };
  return (
    <>
      <div className="page-head"><h1>{t("البنك", "Bank")}</h1>
        {can("bank", true) && <button className="brand" disabled={busy} onClick={refresh}>⟳ {t("تحديث الأرصدة", "Refresh balances")}</button>}
      </div>
      <CrudPage key={`a${key}`} table="bank_accounts" module="bank" title={{ ar: "الحسابات البنكية", en: "Bank accounts" }}
        orderBy={{ column: "bank_name", ascending: true }} totals={["balance"]} fields={[
          { key: "bank_name", ar: "البنك", en: "Bank", required: true },
          { key: "account_name", ar: "اسم الحساب", en: "Account name" },
          { key: "iban", ar: "الآيبان", en: "IBAN" },
          { key: "currency", ar: "العملة", en: "Currency" },
          { key: "balance", ar: "الرصيد", en: "Balance", type: "money" },
          { key: "last_refreshed_at", ar: "آخر تحديث", en: "Last refresh", type: "datetime", readOnly: true },
        ]} />
      <CrudPage key={`t${key}`} table="bank_transactions" module="bank" title={{ ar: "الحركات", en: "Transactions" }}
        orderBy={{ column: "tx_date" }} totals={["amount"]} fields={[
          { key: "bank_account_id", ar: "الحساب", en: "Account", type: "ref", ref: { table: "bank_accounts", label: "bank_name" }, required: true },
          { key: "tx_date", ar: "التاريخ", en: "Date", type: "date", required: true },
          { key: "description", ar: "البيان", en: "Description" },
          { key: "amount", ar: "المبلغ", en: "Amount", type: "money", required: true },
          { key: "balance_after", ar: "الرصيد بعدها", en: "Balance after", type: "money" },
        ]} />
    </>
  );
}
