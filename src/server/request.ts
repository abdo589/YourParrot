import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP. Only trust X-Forwarded-For when the app runs behind a
 * proxy you control (Vercel, Nginx, Cloudflare) that overwrites the header.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}
