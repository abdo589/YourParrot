import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Tx } from "../lib/translate";

interface Notif { id: number; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

export function useUnreadMessages() {
  const { session, can } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!session || !can("messages")) return;
    const load = () => supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("recipient_id", session.user.id).is("read_at", null).then(({ count }) => setN(count ?? 0));
    load();
    const ch = supabase.channel("unread-msgs").on("postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${session.user.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, can]);
  return n;
}

export function NotificationsBell() {
  const { session } = useAuth();
  const { t, fmtDateTime } = useI18n();
  const nav = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    const load = () => supabase.from("notifications").select("*").eq("user_id", session.user.id)
      .order("created_at", { ascending: false }).limit(30).then(({ data }) => setItems((data ?? []) as Notif[]));
    load();
    const ch = supabase.channel("notifs").on("postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, (p) => {
        load();
        const n = p.new as Notif;
        if ("Notification" in window && Notification.permission === "granted") new Notification(n.title, { body: n.body ?? "" });
      }).subscribe();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  const unread = items.filter((i) => !i.read_at).length;
  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("user_id", session!.user.id);
    setItems(items.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="ghost icon" onClick={() => setOpen(!open)} aria-label={t("الإشعارات", "Notifications")}>
        🔔{unread > 0 && <span className="count">{unread}</span>}
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", insetInlineEnd: 0, top: 40, width: 340, maxHeight: 420, overflow: "auto", zIndex: 30, padding: 0 }}>
          <div className="card-head" style={{ padding: "10px 12px", margin: 0 }}>
            <h3 style={{ flex: 1 }}>{t("الإشعارات", "Notifications")}</h3>
            {unread > 0 && <button className="sm" onClick={markAll}>{t("تعليم الكل كمقروء", "Mark all read")}</button>}
          </div>
          {!items.length && <div className="empty">{t("لا توجد إشعارات", "No notifications")}</div>}
          {items.map((n) => (
            <div key={n.id} style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", cursor: n.link ? "pointer" : "default", background: n.read_at ? undefined : "var(--accent-soft)" }}
              onClick={() => { if (n.link) { nav(n.link); setOpen(false); } }}>
              <b style={{ fontSize: 13 }}><Tx>{n.title}</Tx></b>
              {n.body && <div className="muted" style={{ fontSize: 12 }}><Tx>{n.body}</Tx></div>}
              <small className="muted">{fmtDateTime(n.created_at)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
