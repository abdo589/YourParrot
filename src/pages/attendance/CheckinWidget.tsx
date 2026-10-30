// Selfie + location punch, shared by the public secret-link page and the
// signed-in "My check-in" page. Location is recorded, never enforced.
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../lib/i18n";
import { functionsUrl, supabase } from "../../lib/supabase";

export interface Punch { punch_type: string; punched_at: string; source: string }

export function CheckinWidget({ token, today, onDone }: { token?: string; today: Punch[]; onDone: () => void }) {
  const { t, fmtDateTime } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locErr, setLocErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setLocErr(true),
      { enableHighAccuracy: true, timeout: 15000 });
    return () => stream?.getTracks().forEach((x) => x.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setStream(s); setShot(null);
      setTimeout(() => { if (video.current) { video.current.srcObject = s; video.current.play(); } }, 0);
    } catch { setMsg({ ok: false, text: t("لا يمكن فتح الكاميرا. اسمح بالوصول للكاميرا.", "Cannot open the camera. Please allow camera access.") }); }
  };
  const capture = () => {
    const v = video.current!; const c = document.createElement("canvas");
    const w = 600; c.width = w; c.height = Math.round((v.videoHeight / v.videoWidth) * w) || 800;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    setShot(c.toDataURL("image/jpeg", 0.8));
    stream?.getTracks().forEach((x) => x.stop()); setStream(null);
  };

  const submit = async (punch_type: "in" | "out") => {
    if (!shot) return;
    setBusy(true); setMsg(null);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!token) {
      const { data } = await supabase.auth.getSession();
      headers.Authorization = `Bearer ${data.session?.access_token}`;
    }
    const res = await fetch(`${functionsUrl}/phone-checkin`, {
      method: "POST", headers, body: JSON.stringify({ token, punch_type, selfie: shot, lat: pos?.lat, lng: pos?.lng }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `${punch_type === "in" ? t("تم تسجيل الحضور", "Checked in") : t("تم تسجيل الانصراف", "Checked out")} ✓`
        + (body.distance_m != null ? ` — ${t("المسافة من المكتب", "distance from office")}: ${body.distance_m} ${t("م", "m")}` : "")
        + (body.emailed ? ` — ${t("أُرسلت الصورة لبريدك", "photo link emailed")}` : "") });
      setShot(null); onDone();
    } else {
      setMsg({ ok: false, text: body.error === "duplicate" ? t("تم التسجيل مسبقًا اليوم.", "Already recorded today.")
        : body.error === "invalid_link" ? t("الرابط غير صالح.", "Invalid link.") : String(body.error ?? res.status) });
    }
  };

  const hasIn = today.some((p) => p.punch_type === "in");
  const hasOut = today.some((p) => p.punch_type === "out");
  return (
    <>
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`}>{msg.text}</div>}
      <div className="muted" style={{ fontSize: 12 }}>
        {pos ? `📍 ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : locErr ? t("📍 تعذر تحديد الموقع (سيتم التسجيل بدونه)", "📍 Location unavailable (will record without it)") : t("📍 جارٍ تحديد الموقع…", "📍 Locating…")}
      </div>
      {stream ? <><video ref={video} className="camera" playsInline muted /><button className="primary" onClick={capture}>📸 {t("التقاط", "Capture")}</button></>
        : shot ? <><img src={shot} className="camera" alt="selfie" /><button onClick={startCam}>{t("إعادة التصوير", "Retake")}</button></>
        : <button className="brand" onClick={startCam}>📷 {t("التقاط صورة سيلفي", "Take a selfie")}</button>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" style={{ flex: 1 }} disabled={!shot || busy || hasIn} onClick={() => submit("in")}>{t("تسجيل حضور", "Check in")}</button>
        <button style={{ flex: 1 }} disabled={!shot || busy || hasOut} onClick={() => submit("out")}>{t("تسجيل انصراف", "Check out")}</button>
      </div>
      {today.length > 0 && <table className="data"><tbody>{today.map((p, i) => <tr key={i}>
        <td>{p.punch_type === "in" ? t("حضور", "In") : p.punch_type === "out" ? t("انصراف", "Out") : t("بصمة", "Punch")}</td>
        <td>{fmtDateTime(p.punched_at)}</td><td className="muted">{p.source}</td></tr>)}</tbody></table>}
    </>
  );
}
