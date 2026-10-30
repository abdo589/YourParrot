// Minimal Claude Messages API client (no SDK needed in the edge runtime).
const API = "https://api.anthropic.com/v1/messages";
export const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5-5";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export interface Message { role: "user" | "assistant"; content: string | ContentBlock[] }

export async function claude(system: string, messages: Message[], maxTokens = 2048): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return (body.content as { type: string; text?: string }[])
    .filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

/** Turns an attachment (base64 + mime) into the right content block. */
export function attachmentBlock(name: string, mime: string, base64: string): ContentBlock {
  if (mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  if (mime.startsWith("image/")) return { type: "image", source: { type: "base64", media_type: mime, data: base64 } };
  const text = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  return { type: "text", text: `--- ${name} ---\n${text.slice(0, 200_000)}` };
}
