// Personal Outlook mailbox. Each user connects their own account; the edge
// function only ever uses the caller's own token.
import { useState } from "react";
import { callFn } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { Empty, Modal, Tabs, useLoad, useToast } from "../../components/ui";

interface MailItem { id: string; subject: string; from?: { emailAddress: { name: string; address: string } }; receivedDateTime: string; isRead: boolean; bodyPreview: string }

export default function Mail() {
  const { t, fmtDateTime } = useI18n();
  const toast = useToast();
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [reading, setReading] = useState<any>(null);
  const [compose, setCompose] = useState<{ to: string; subject: string; html: string } | null>(null);
  const status = useLoad(() => callFn<{ connected: boolean; email: string | null }>("outlook", { action: "status" }).catch(() => ({ connected: false, email: null })));
  const list = useLoad(async () => (status.data?.connected ? (await callFn<{ value: MailItem[] }>("outlook", { action: "list", folder })).value ?? [] : []), [status.data, folder]);

  const connect = async () => { try { location.assign((await callFn<{ url: string }>("outlook", { action: "connect" })).url); } catch (e) { toast.error(e); } };
  const open = async (m: MailItem) => { try { setReading(await callFn("outlook", { action: "read", id: m.id })); } catch (e) { toast.error(e); } };
  const send = async () => {
    try { await callFn("outlook", { action: "send", ...compose, html: compose!.html.replace(/\n/g, "<br>") }); toast.ok(t("تم الإرسال", "Sent")); setCompose(null); }
    catch (e) { toast.error(e); }
  };

  if (status.loading) return <Empty>…</Empty>;
  if (!status.data?.connected) {
    return <div className="card"><h1>{t("البريد", "Mail")}</h1>
      <p className="muted">{t("اربط صندوق Outlook الخاص بك. لا يستطيع أي مستخدم آخر قراءة صندوقك.", "Connect your own Outlook mailbox. No other user can read it.")}</p>
      <button className="primary" onClick={connect}>{t("ربط Outlook", "Connect Outlook")}</button></div>;
  }
  return (
    <>
      <div className="page-head"><h1>{t("البريد", "Mail")} <small className="muted">{status.data.email}</small></h1>
        <div className="toolbar"><button className="primary" onClick={() => setCompose({ to: "", subject: "", html: "" })}>✎ {t("رسالة جديدة", "Compose")}</button>
          <button onClick={() => list.reload()}>⟳</button>
          <button className="danger" onClick={async () => { await callFn("outlook", { action: "disconnect" }); status.reload(); }}>{t("فصل الحساب", "Disconnect")}</button></div></div>
      <Tabs value={folder} onChange={setFolder} tabs={[{ id: "inbox", label: t("الوارد", "Inbox") }, { id: "sent", label: t("المرسل", "Sent") }]} />
      <div className="card flush">{list.loading ? <Empty>…</Empty> : !(list.data ?? []).length ? <Empty /> :
        <ul className="mail-list">{(list.data ?? []).map((m) => <li key={m.id} className={m.isRead ? "" : "unread"} onClick={() => open(m)}>
          <b>{m.from?.emailAddress.name ?? m.from?.emailAddress.address}</b> — {m.subject}<br />
          <small className="muted">{fmtDateTime(m.receivedDateTime)} · {m.bodyPreview.slice(0, 120)}</small></li>)}</ul>}</div>
      {reading && <Modal wide title={reading.subject} onClose={() => setReading(null)}
        footer={<button onClick={() => { setCompose({ to: reading.from?.emailAddress.address ?? "", subject: "RE: " + reading.subject, html: "" }); setReading(null); }}>{t("رد", "Reply")}</button>}>
        <p className="muted">{reading.from?.emailAddress.name} &lt;{reading.from?.emailAddress.address}&gt; · {fmtDateTime(reading.receivedDateTime)}</p>
        {/* Mail HTML is rendered in a sandboxed frame with scripts disabled. */}
        <iframe title="mail" sandbox="" className="mail-body" style={{ width: "100%", height: "60vh", border: 0 }}
          srcDoc={reading.body?.contentType === "html" ? reading.body.content : `<pre style="white-space:pre-wrap">${String(reading.body?.content ?? "").replace(/</g, "&lt;")}</pre>`} />
      </Modal>}
      {compose && <Modal title={t("رسالة جديدة", "Compose")} onClose={() => setCompose(null)}
        footer={<button className="primary" disabled={!compose.to} onClick={send}>{t("إرسال", "Send")}</button>}>
        <div className="form-grid">
          <label className="field">{t("إلى", "To")}<input value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} /></label>
          <label className="field">{t("الموضوع", "Subject")}<input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></label>
          <label className="field wide">{t("النص", "Body")}<textarea rows={8} value={compose.html} onChange={(e) => setCompose({ ...compose, html: e.target.value })} /></label>
        </div></Modal>}
    </>
  );
}
