import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Tx } from "../../lib/translate";
import { Empty, Modal, Tabs, useLoad, useToast } from "../../components/ui";

export default function Messages() {
  const { session, can } = useAuth();
  const { t, fmtDateTime } = useI18n();
  const toast = useToast();
  const me = session!.user.id;
  const [box, setBox] = useState<"in" | "out">("in");
  const [open, setOpen] = useState<any>(null);
  const [compose, setCompose] = useState<{ to: string; subject: string; body: string } | null>(null);
  const people = useLoad(async () => (await supabase.from("directory").select("id, full_name, username").order("full_name")).data ?? []);
  const msgs = useLoad(async () => (await supabase.from("messages").select("*").eq(box === "in" ? "recipient_id" : "sender_id", me)
    .order("created_at", { ascending: false }).limit(200)).data ?? [], [box]);
  useEffect(() => {
    const ch = supabase.channel("msgs-page").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => msgs.reload()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const name = (id: string) => (people.data as any[] ?? []).find((p) => p.id === id)?.full_name ?? "—";
  const read = async (m: any) => {
    setOpen(m);
    if (box === "in" && !m.read_at) { await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id); msgs.reload(); }
  };
  const send = async () => {
    const { error } = await supabase.from("messages").insert({ sender_id: me, recipient_id: compose!.to, subject: compose!.subject, body: compose!.body });
    if (error) toast.error(error); else { toast.ok(t("تم الإرسال", "Sent")); setCompose(null); if (box === "out") msgs.reload(); }
  };
  return (
    <>
      <div className="page-head"><h1>{t("الرسائل الداخلية", "Internal messages")}</h1>
        {can("messages", true) && <button className="primary" onClick={() => setCompose({ to: "", subject: "", body: "" })}>✎ {t("رسالة جديدة", "New message")}</button>}</div>
      <Tabs value={box} onChange={setBox} tabs={[{ id: "in", label: t("الوارد", "Inbox") }, { id: "out", label: t("المرسل", "Sent") }]} />
      <div className="card flush">{!(msgs.data as any[])?.length ? <Empty /> : <table className="data"><tbody>
        {(msgs.data as any[]).map((m) => <tr key={m.id} onClick={() => read(m)} style={{ cursor: "pointer", fontWeight: box === "in" && !m.read_at ? 700 : 400 }}>
          <td>{box === "in" ? name(m.sender_id) : name(m.recipient_id)}</td><td><Tx>{m.subject}</Tx></td>
          <td className="muted"><Tx>{m.body.slice(0, 80)}</Tx></td><td>{fmtDateTime(m.created_at)}</td></tr>)}</tbody></table>}</div>
      {open && <Modal title={open.subject || t("رسالة", "Message")} onClose={() => setOpen(null)}
        footer={box === "in" && can("messages", true) && <button onClick={() => { setCompose({ to: open.sender_id, subject: "RE: " + (open.subject ?? ""), body: "" }); setOpen(null); }}>{t("رد", "Reply")}</button>}>
        <p className="muted">{name(open.sender_id)} → {name(open.recipient_id)} · {fmtDateTime(open.created_at)}</p>
        <p style={{ whiteSpace: "pre-wrap" }}><Tx>{open.body}</Tx></p></Modal>}
      {compose && <Modal title={t("رسالة جديدة", "New message")} onClose={() => setCompose(null)}
        footer={<button className="primary" disabled={!compose.to || !compose.body.trim()} onClick={send}>{t("إرسال", "Send")}</button>}>
        <div className="form-grid">
          <label className="field">{t("إلى", "To")}<select value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })}>
            <option value="">—</option>{(people.data as any[] ?? []).filter((p) => p.id !== me).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
          <label className="field">{t("الموضوع", "Subject")}<input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></label>
          <label className="field wide">{t("النص", "Message")}<textarea rows={6} value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} /></label>
        </div></Modal>}
    </>
  );
}
