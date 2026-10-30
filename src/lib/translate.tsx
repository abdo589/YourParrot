// Display-only translation of leftover Arabic (names/notes) in English mode.
// The stored value is never modified; translations are cached per device
// and in a shared server-side cache.
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { callFn } from "./supabase";

const AR = /[؀-ۿ]/;
const mem = new Map<string, string>();
try { Object.entries(JSON.parse(localStorage.getItem("mf-tx") ?? "{}")).forEach(([k, v]) => mem.set(k, v as string)); } catch { /* ignore */ }

let queue = new Set<string>();
let timer: number | undefined;
const waiters = new Map<string, ((v: string) => void)[]>();

function flush() {
  const batch = [...queue]; queue = new Set();
  callFn<{ translations: Record<string, string> }>("translate", { texts: batch })
    .then(({ translations }) => {
      for (const [src, en] of Object.entries(translations)) {
        mem.set(src, en);
        waiters.get(src)?.forEach((fn) => fn(en)); waiters.delete(src);
      }
      try { localStorage.setItem("mf-tx", JSON.stringify(Object.fromEntries([...mem].slice(-3000)))); } catch { /* ignore */ }
    })
    .catch(() => batch.forEach((s) => { waiters.get(s)?.forEach((fn) => fn(s)); waiters.delete(s); }));
}

function request(text: string): Promise<string> {
  return new Promise((resolve) => {
    waiters.set(text, [...(waiters.get(text) ?? []), resolve]);
    queue.add(text);
    clearTimeout(timer);
    timer = window.setTimeout(flush, 150);
  });
}

export function useDisplayText(value: string | null | undefined): string {
  const { lang } = useI18n();
  const raw = value ?? "";
  const needs = lang === "en" && AR.test(raw);
  const [out, setOut] = useState(needs ? mem.get(raw) ?? raw : raw);
  useEffect(() => {
    if (!needs) { setOut(raw); return; }
    const hit = mem.get(raw);
    if (hit) { setOut(hit); return; }
    let live = true;
    request(raw).then((v) => live && setOut(v));
    return () => { live = false; };
  }, [raw, needs]);
  return out;
}

/** <Tx>{arabicOrEnglishText}</Tx> — renders an English display translation when needed. */
export function Tx({ children }: { children: string | null | undefined }) {
  return <>{useDisplayText(children)}</>;
}
