import { supabase } from "./supabase";

/** Maps database error codes/prefixes to bilingual, human messages. */
export function friendlyError(e: unknown, t: (ar: string, en: string) => string): string {
  const err = e as { message?: string; code?: string } | null;
  const msg = err?.message ?? String(e);
  const code = err?.code;
  if (msg.includes("VERSION_CONFLICT") || code === "40001")
    return t("قام مستخدم آخر بتعديل هذا السجل. أعد تحميل الصفحة ثم حاول مجددًا.", "Someone else changed this record. Reload and try again.");
  if (msg.includes("RECORD_DELETED")) return t("هذا السجل محذوف ولا يمكن تعديله أو استرجاعه.", "This record was deleted and cannot be edited or restored.");
  if (msg.includes("FROZEN")) return t("القيم مقفلة بعد «فاز».", "Values are locked after “Won”.");
  if (code === "23505" || msg.includes("duplicate")) return t("هذا السجل موجود مسبقًا (تكرار).", "This record already exists (duplicate).");
  if (code === "23P01" || msg.includes("exclusion")) return t("يوجد تداخل مع إجازة نشطة لنفس الموظف.", "Overlaps an active leave for the same employee.");
  if (msg.includes("row-level security") || msg.includes("FORBIDDEN") || code === "42501")
    return t("ليست لديك صلاحية لهذا الإجراء.", "You don't have permission for this action.");
  if (msg.includes("INVALID:")) return msg.split("INVALID:")[1].trim();
  return msg;
}

let lastSent = 0;
let sentThisSession = 0;
/** Auto-captures browser errors into the developer's bug inbox (throttled). */
export function installErrorCapture() {
  const send = (message: string, stack?: string) => {
    const now = Date.now();
    if (now - lastSent < 5000 || sentThisSession > 20) return;
    lastSent = now; sentThisSession++;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("bug_reports").insert({
        user_id: data.user.id, kind: "auto", message: message.slice(0, 2000), stack: stack?.slice(0, 8000),
        url: location.pathname, user_agent: navigator.userAgent,
      }).then(() => undefined);
    });
  };
  window.addEventListener("error", (e) => send(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string };
    send(r?.message ?? String(e.reason), r?.stack);
  });
}
