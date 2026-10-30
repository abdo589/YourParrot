import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Modal, useToast } from "./ui";

export function BugReportButton() {
  const { session } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const send = async () => {
    const { error } = await supabase.from("bug_reports").insert({
      user_id: session!.user.id, kind: "report", message: msg, url: location.pathname, user_agent: navigator.userAgent,
    });
    if (error) toast.error(error); else { toast.ok(t("تم إرسال البلاغ للمطوّر", "Report sent to the developer")); setOpen(false); setMsg(""); }
  };
  return (
    <>
      <button className="ghost icon" title={t("الإبلاغ عن مشكلة", "Report a problem")} onClick={() => setOpen(true)}>🐞</button>
      {open && (
        <Modal title={t("الإبلاغ عن مشكلة", "Report a problem")} onClose={() => setOpen(false)}
          footer={<button className="primary" disabled={!msg.trim()} onClick={send}>{t("إرسال", "Send")}</button>}>
          <label className="field">{t("صف المشكلة", "Describe the problem")}
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} autoFocus /></label>
        </Modal>
      )}
    </>
  );
}
