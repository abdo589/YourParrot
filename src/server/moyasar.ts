import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { updateOrder, type OrderRecord } from "./store";

/**
 * Moyasar (https://moyasar.com) hosted invoices: the customer pays on
 * Moyasar's PCI-DSS page with mada, Apple Pay, Visa/Mastercard or STC Pay.
 * Card data never reaches this server. Payment results are never trusted from
 * the browser or the webhook body — we always re-fetch the invoice with the
 * secret key and check the amount before marking an order as paid.
 */

const API = (process.env.MOYASAR_API_URL ?? "https://api.moyasar.com/v1").replace(/\/+$/, "");
/** Host the hosted payment page must live on (guards against open redirects). */
const CHECKOUT_HOST = process.env.MOYASAR_CHECKOUT_HOST ?? "moyasar.com";

export interface MoyasarInvoice {
  id: string;
  status: string;
  amount: number;
  currency: string;
  url: string;
  metadata?: Record<string, string> | null;
  payments?: { id: string; status: string; amount: number }[];
}

export function onlinePaymentsEnabled(): boolean {
  return Boolean(process.env.MOYASAR_SECRET_KEY && siteUrl());
}

/** Absolute public URL of the site. Never derived from request headers (host header injection). */
export function siteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** SAR → halalas (Moyasar expects the smallest currency unit). */
export function toHalalas(sar: number): number {
  return Math.round(sar * 100);
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (!key) throw new Error("MOYASAR_SECRET_KEY is not configured");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Log status only; the body may echo request data.
    throw new Error(`Moyasar ${method} ${path} failed with HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function isAllowedCheckoutUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const hostOk = u.hostname === CHECKOUT_HOST || u.hostname.endsWith(`.${CHECKOUT_HOST}`);
    const protoOk = u.protocol === "https:" || (u.hostname === "localhost" && CHECKOUT_HOST === "localhost");
    return hostOk && protoOk;
  } catch {
    return false;
  }
}

export async function createInvoice(order: OrderRecord): Promise<MoyasarInvoice> {
  const base = siteUrl();
  if (!base || !order.accessToken) throw new Error("Online payments are not configured");

  const orderUrl = `${base}/order/${encodeURIComponent(order.ref)}?t=${order.accessToken}`;
  const invoice = await call<MoyasarInvoice>("POST", "/invoices", {
    amount: toHalalas(order.total),
    currency: "SAR",
    description: `طلب ${order.ref} من ببغاوتك`,
    success_url: orderUrl,
    back_url: orderUrl,
    callback_url: `${base}/api/payments/moyasar`,
    expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: { order_ref: order.ref },
  });

  if (!invoice?.id || !isAllowedCheckoutUrl(invoice.url)) {
    throw new Error("Unexpected invoice response from Moyasar");
  }
  return invoice;
}

export function fetchInvoice(id: string): Promise<MoyasarInvoice> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new Error("Invalid invoice id");
  return call<MoyasarInvoice>("GET", `/invoices/${id}`);
}

/**
 * Re-checks the order's invoice with Moyasar and updates the order status.
 * Safe to call repeatedly (return page, webhook) — it is idempotent.
 */
export async function syncPayment(order: OrderRecord): Promise<OrderRecord> {
  if (order.payment !== "online" || !order.invoiceId || order.status === "paid") return order;

  const invoice = await fetchInvoice(order.invoiceId);
  const matches =
    invoice.id === order.invoiceId &&
    invoice.currency === "SAR" &&
    invoice.amount === toHalalas(order.total);

  if (invoice.status === "paid" && matches) {
    const payment = invoice.payments?.find((p) => p.status === "paid");
    return (
      (await updateOrder(order.ref, (o) =>
        o.status === "paid" ? null : { status: "paid", paidAt: new Date().toISOString(), paymentId: payment?.id },
      )) ?? order
    );
  }

  if (invoice.status === "paid" && !matches) {
    console.error(`[payments] amount/currency mismatch for order ${order.ref}; not marking as paid`);
    return order;
  }

  if (["expired", "canceled", "failed"].includes(invoice.status)) {
    return (await updateOrder(order.ref, (o) => (o.status === "paid" ? null : { status: "payment_failed" }))) ?? order;
  }
  return order;
}

/** Constant-time check of the shared secret Moyasar sends with each webhook. */
export function verifyWebhookToken(token: unknown): boolean {
  const expected = process.env.MOYASAR_WEBHOOK_SECRET;
  if (!expected || typeof token !== "string") return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function safeTokenEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
