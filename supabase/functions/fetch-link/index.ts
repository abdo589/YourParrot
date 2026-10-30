// Attach a file from a cloud link (Google Drive / Dropbox / OneDrive / SharePoint …)
// Protections: HTTPS only, allow-listed hosts on every redirect hop,
// allowed MIME types only, 25 MB hard cap while streaming.
import { callerId } from "../_shared/clients.ts";
import { json, preflight } from "../_shared/cors.ts";

const MAX = 25 * 1024 * 1024;
const HOSTS = [
  "drive.google.com", "docs.google.com", "drive.usercontent.google.com", "lh3.googleusercontent.com",
  "www.dropbox.com", "dropbox.com", "dl.dropboxusercontent.com", "uc*.dl.dropboxusercontent.com",
  "onedrive.live.com", "1drv.ms", "api.onedrive.com", "*.sharepoint.com", "*.files.1drv.com",
  "*.box.com", "wetransfer.com", "*.wetransfer.com",
];
const TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/csv",
  "application/json", "text/markdown",
];

const hostAllowed = (h: string) => HOSTS.some((p) =>
  p.includes("*") ? new RegExp("^" + p.replace(/\./g, "\\.").replace(/\*/g, "[a-z0-9-]+") + "$").test(h) : h === p);

function direct(u: URL): URL {
  if (u.hostname === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? u.searchParams.get("id");
    if (id) return new URL(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
  }
  if (u.hostname === "docs.google.com") {
    const id = u.pathname.match(/\/d\/([^/]+)/)?.[1];
    if (id) return new URL(`https://docs.google.com/${u.pathname.split("/")[1]}/d/${id}/export?format=pdf`);
  }
  if (u.hostname.endsWith("dropbox.com")) { u.searchParams.set("dl", "1"); return u; }
  if (u.hostname === "1drv.ms" || u.hostname === "onedrive.live.com") {
    const share = "u!" + btoa(u.toString()).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
    return new URL(`https://api.onedrive.com/v1.0/shares/${share}/root/content`);
  }
  if (u.hostname.endsWith(".sharepoint.com") && !u.searchParams.has("download")) { u.searchParams.set("download", "1"); return u; }
  return u;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!(await callerId(req))) return json({ error: "unauthorized" }, 401);
  let url: URL;
  try { url = new URL((await req.json()).url); } catch { return json({ error: "bad_url" }, 400); }
  if (url.protocol !== "https:" || !hostAllowed(url.hostname)) return json({ error: "host_not_allowed" }, 400);

  let target = direct(url);
  let res: Response | null = null;
  for (let hop = 0; hop < 6; hop++) {
    if (target.protocol !== "https:" || !hostAllowed(target.hostname)) return json({ error: "redirect_not_allowed", host: target.hostname }, 400);
    res = await fetch(target, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      target = new URL(res.headers.get("location")!, target);
      continue;
    }
    break;
  }
  if (!res || !res.ok || !res.body) return json({ error: "download_failed", status: res?.status }, 502);

  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.includes(mime)) return json({ error: "type_not_allowed", mime }, 415);
  if (Number(res.headers.get("content-length") ?? 0) > MAX) return json({ error: "too_large" }, 413);

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX) { await reader.cancel(); return json({ error: "too_large" }, 413); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0; for (const c of chunks) { all.set(c, off); off += c.length; }
  let bin = ""; for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode(...all.subarray(i, i + 0x8000));

  const cd = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] ?? url.pathname.split("/").pop() ?? "file");
  return json({ name, mime, size, base64: btoa(bin) });
});
