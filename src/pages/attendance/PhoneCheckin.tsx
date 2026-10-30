// Public page behind the secret per-employee link: /c/<token>. No account.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useI18n } from "../../lib/i18n";
import { functionsUrl } from "../../lib/supabase";
import { CheckinWidget, type Punch } from "./CheckinWidget";

export function PhoneCheckin() {
  const { token } = useParams();
  const { t, lang, setLang } = useI18n();
  const [info, setInfo] = useState<{ name: string; name_en?: string; today: Punch[] } | null>(null);
  const [bad, setBad] = useState(false);
  const load = () => fetch(`${functionsUrl}/phone-checkin?token=${encodeURIComponent(token!)}`)
    .then(async (r) => (r.ok ? setInfo(await r.json()) : setBad(true))).catch(() => setBad(true));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  return (
    <div className="checkin-page">
      <div className="card">
        <div className="brand" style={{ color: "var(--text)", padding: 0 }}><img src="/icons/logo.svg" alt="" style={{ width: 36 }} />
          <div style={{ flex: 1 }}><b>METAL FUZE</b><br /><small className="muted">{t("تسجيل الحضور", "Attendance")}</small></div>
          <button className="ghost sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "عربي"}</button></div>
        {bad && <div className="alert error">{t("الرابط غير صالح أو منتهي.", "This link is invalid or expired.")}</div>}
        {info && <>
          <h1>{lang === "en" && info.name_en ? info.name_en : info.name}</h1>
          <CheckinWidget token={token} today={info.today} onDone={load} />
        </>}
      </div>
    </div>
  );
}
