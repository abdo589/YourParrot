// Dropdown backed by shared lookup values. Choosing «أخرى / Other» lets the
// user type a new value, which is saved for everyone.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";

const cache = new Map<string, string[]>();
const OTHER = "__other__";

export function useLookup(category: string) {
  const [values, setValues] = useState<string[]>(cache.get(category) ?? []);
  useEffect(() => {
    supabase.from("lookup_values").select("value").eq("category", category).order("value").then(({ data }) => {
      const v = (data ?? []).map((r) => r.value as string);
      cache.set(category, v); setValues(v);
    });
  }, [category]);
  return values;
}

export function SelectOther({ category, value, onChange, required }: {
  category: string; value: string | null | undefined; onChange: (v: string) => void; required?: boolean;
}) {
  const { t } = useI18n();
  const values = useLookup(category);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const list = value && !values.includes(value) ? [...values, value] : values;

  const commit = async () => {
    const v = draft.trim();
    if (!v) { setTyping(false); return; }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("lookup_values").insert({ category, value: v, created_by: u.user?.id });
    cache.set(category, [...(cache.get(category) ?? []), v].sort());
    onChange(v); setTyping(false); setDraft("");
  };

  if (typing) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("اكتب القيمة الجديدة", "Type the new value")}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
        <button type="button" className="primary sm" onClick={commit}>{t("حفظ", "Save")}</button>
        <button type="button" className="sm" onClick={() => setTyping(false)}>✕</button>
      </div>
    );
  }
  return (
    <select value={value ?? ""} required={required} onChange={(e) => (e.target.value === OTHER ? setTyping(true) : onChange(e.target.value))}>
      <option value="">—</option>
      {list.map((v) => <option key={v} value={v}>{v}</option>)}
      <option value={OTHER}>{t("أخرى…", "Other…")}</option>
    </select>
  );
}
