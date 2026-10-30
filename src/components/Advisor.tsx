// Floating AI advisor. Threads are stored on this device only. The server
// builds its snapshot with the caller's own permissions (RLS).
import { useEffect, useRef, useState } from "react";
import { callFn, fileToBase64 } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";

interface Msg { role: "user" | "assistant"; content: string; files?: string[] }
interface Thread { id: string; title: string; messages: Msg[]; updated: number }
interface Attachment { name: string; mime: string; base64: string }

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/csv", "application/json", "text/markdown"];
const MAX = 25 * 1024 * 1024;

function storeKey(uid: string) { return `mf-advisor-${uid}`; }
function loadThreads(uid: string): Thread[] {
  try { return JSON.parse(localStorage.getItem(storeKey(uid)) ?? "[]"); } catch { return []; }
}

export function Advisor() {
  const { session } = useAuth();
  const { t, lang } = useI18n();
  const uid = session!.user.id;
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>(() => loadThreads(uid));
  const [currentId, setCurrentId] = useState<string | null>(threads[0]?.id ?? null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const current = threads.find((x) => x.id === currentId) ?? null;
  useEffect(() => { try { localStorage.setItem(storeKey(uid), JSON.stringify(threads.slice(0, 30))); } catch { /* full */ } }, [threads, uid]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [current?.messages.length, busy]);

  const addFiles = async (list: FileList | null) => {
    setErr("");
    for (const f of Array.from(list ?? [])) {
      if (!ALLOWED.includes(f.type)) { setErr(t("نوع ملف غير مسموح", "File type not allowed") + `: ${f.name}`); continue; }
      if (f.size > MAX) { setErr(t("الحد الأقصى 25MB", "Max 25 MB") + `: ${f.name}`); continue; }
      const base64 = await fileToBase64(f);
      setFiles((x) => [...x, { name: f.name, mime: f.type, base64 }]);
    }
  };
  const addLink = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await callFn<Attachment & { size: number }>("fetch-link", { url: link.trim() });
      setFiles((x) => [...x, { name: r.name, mime: r.mime, base64: r.base64 }]); setLink("");
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    let th = current;
    if (!th) { th = { id: crypto.randomUUID(), title: text.slice(0, 40), messages: [], updated: Date.now() }; }
    const msgs: Msg[] = [...th.messages, { role: "user", content: text, files: files.map((f) => f.name) }];
    const next = { ...th, messages: msgs, updated: Date.now() };
    setThreads((all) => [next, ...all.filter((x) => x.id !== next.id)]);
    setCurrentId(next.id); setInput(""); setBusy(true); setErr("");
    const attachments = files; setFiles([]);
    try {
      const { reply } = await callFn<{ reply: string }>("advisor", {
        lang, attachments, messages: msgs.map(({ role, content }) => ({ role, content })),
      });
      const done = { ...next, messages: [...msgs, { role: "assistant" as const, content: reply }], updated: Date.now() };
      setThreads((all) => [done, ...all.filter((x) => x.id !== done.id)]);
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };

  return (
    <>
      <button className="fab" onClick={() => setOpen(!open)} title={t("المستشار الذكي", "AI advisor")} aria-label="AI advisor">✦</button>
      {open && (
        <div className="advisor">
          <header>
            <b style={{ flex: 1 }}>✦ {t("المستشار الذكي", "AI advisor")}</b>
            <select style={{ width: 150 }} value={currentId ?? ""} onChange={(e) => setCurrentId(e.target.value || null)}>
              <option value="">{t("محادثة جديدة", "New chat")}</option>
              {threads.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            {current && <button className="ghost icon" title={t("حذف المحادثة", "Delete chat")}
              onClick={() => { setThreads(threads.filter((x) => x.id !== current.id)); setCurrentId(null); }}>🗑</button>}
            <button className="ghost icon" onClick={() => setOpen(false)}>✕</button>
          </header>
          <div className="msgs">
            {!current && <p className="muted">{t("اسألني عن المشاريع والمدفوعات وأي بيانات تملك صلاحية رؤيتها. يمكنك إرفاق PDF أو صور أو ملفات نصية.",
              "Ask about projects, payments or anything you have access to. You can attach PDFs, images or text files.")}</p>}
            {current?.messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content}
                {m.files?.length ? <div className="chips" style={{ marginTop: 4 }}>{m.files.map((f) => <span key={f} className="chip">📎 {f}</span>)}</div> : null}
              </div>
            ))}
            {busy && <div className="bubble assistant">…</div>}
            <div ref={end} />
          </div>
          <footer>
            {err && <div className="alert error" style={{ fontSize: 12 }}>{err}</div>}
            {files.length > 0 && <div className="chips">{files.map((f, i) => <span key={i} className="chip">📎 {f.name}
              <button className="ghost sm" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span>)}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <input placeholder={t("رابط Drive / Dropbox / OneDrive", "Drive / Dropbox / OneDrive link")} value={link} onChange={(e) => setLink(e.target.value)} />
              <button className="sm" disabled={!link.trim() || busy} onClick={addLink}>{t("إرفاق", "Attach")}</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <label className="btn icon" title={t("إرفاق ملف", "Attach file")}>📎
                <input type="file" multiple hidden accept={ALLOWED.join(",")} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
              <textarea style={{ minHeight: 40, height: 40 }} value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={t("اكتب سؤالك…", "Ask something…")}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="primary" disabled={busy || !input.trim()} onClick={send}>➤</button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}
