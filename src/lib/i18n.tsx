import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";
interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Inline bilingual string: t("نص", "Text"). */
  t: (ar: string, en: string) => string;
  fmtDate: (d?: string | Date | null) => string;
  fmtDateTime: (d?: string | Date | null) => string;
  fmtMoney: (n?: number | string | null) => string;
  fmtNum: (n?: number | string | null, digits?: number) => string;
}

const Ctx = createContext<I18n>(null as unknown as I18n);

function initialLang(): Lang {
  try { return localStorage.getItem("mf-lang") === "en" ? "en" : "ar"; } catch { return "ar"; }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem("mf-lang", l); } catch { /* ignore */ }
    setLangState(l);
  }, []);

  const value = useMemo<I18n>(() => {
    // Gregorian calendar, Latin digits in both languages for consistent reports.
    const locale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
    const dateF = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Riyadh" });
    const dtF = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
    const moneyF = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const toDate = (d: string | Date) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00+03:00") : new Date(d));
    return {
      lang, setLang,
      t: (ar, en) => (lang === "ar" ? ar : en),
      fmtDate: (d) => (d ? dateF.format(toDate(d)) : "—"),
      fmtDateTime: (d) => (d ? dtF.format(new Date(d)) : "—"),
      fmtMoney: (n) => (n === null || n === undefined || n === "" ? "—" : `${moneyF.format(Number(n))} ${lang === "ar" ? "ر.س" : "SAR"}`),
      fmtNum: (n, digits = 0) => (n === null || n === undefined || n === "" ? "—"
        : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(n))),
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export function todayISO() {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}
