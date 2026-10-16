import { limits } from "@/server/limits";
import { syncPayment, verifyWebhookToken } from "@/server/moyasar";
import { clientIp } from "@/server/request";
import { findOrderByInvoice, getOrder } from "@/server/store";

const MAX_BODY = 64 * 1024;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Receives Moyasar webhooks / invoice callbacks. The body is only used to
 * find which order to re-check: the actual payment status always comes from
 * a fresh, authenticated request to the Moyasar API (see syncPayment).
 */
export async function POST(request: Request) {
  if (!limits.webhook.check(`webhook:${await clientIp()}`).ok) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return new Response("Payload Too Large", { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response("Payload Too Large", { status: 413 });

  let body: Json;
  try {
    body = obj(JSON.parse(raw));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Dashboard webhooks carry a shared secret; reject forged ones outright.
  if ("secret_token" in body && !verifyWebhookToken(body.secret_token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = obj(body.data);
  const invoiceIds = [str(data.invoice_id), str(body.invoice_id), str(body.id)].filter(Boolean) as string[];
  const orderRef = str(obj(data.metadata).order_ref) ?? str(obj(body.metadata).order_ref);

  let order = null;
  for (const id of invoiceIds) {
    order = await findOrderByInvoice(id);
    if (order) break;
  }
  if (!order && orderRef && /^YP-[A-F0-9]{8}$/.test(orderRef)) order = await getOrder(orderRef);

  // Always answer 200 for unknown orders so the sender doesn't retry forever.
  if (!order) return Response.json({ ok: true });

  try {
    await syncPayment(order);
  } catch (err) {
    console.error("[payments] webhook sync failed", err);
    return new Response("Upstream Error", { status: 502 }); // let Moyasar retry
  }
  return Response.json({ ok: true });
}
