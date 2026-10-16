import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { OrderRecord } from "@/server/store";

const dir = mkdtempSync(path.join(tmpdir(), "yp-test-"));
process.env.DATA_DIR = dir;
process.env.MOYASAR_SECRET_KEY = "sk_test_123";
process.env.MOYASAR_WEBHOOK_SECRET = "whsec_abc";
process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example";

let store: typeof import("@/server/store");
let moyasar: typeof import("@/server/moyasar");

beforeAll(async () => {
  store = await import("@/server/store");
  moyasar = await import("@/server/moyasar");
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
async function makeOrder(total = 379): Promise<OrderRecord> {
  const order: OrderRecord = {
    ref: `YP-0000000${n++}`,
    createdAt: new Date().toISOString(),
    customer: { name: "x", phone: "0551234567", email: "", region: "الرياض", city: "الرياض", district: "العليا", address: "شارع", postalCode: "", notes: "" },
    items: [],
    subtotal: total,
    shipping: 0,
    total,
    vat: 49.43,
    payment: "online",
    status: "pending_payment",
    accessToken: "tok",
    invoiceId: `inv-${n}-aaaaaaaa`,
  };
  await store.saveOrder(order);
  return order;
}

function mockInvoice(invoice: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(invoice), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("syncPayment", () => {
  it("marks the order paid only when Moyasar confirms the exact amount", async () => {
    const order = await makeOrder();
    const fetchMock = mockInvoice({
      id: order.invoiceId, status: "paid", amount: 37900, currency: "SAR", url: "https://checkout.moyasar.com/x",
      payments: [{ id: "pay_1", status: "paid", amount: 37900 }],
    });
    const updated = await moyasar.syncPayment(order);
    expect(updated.status).toBe("paid");
    expect(updated.paymentId).toBe("pay_1");
    expect((await store.getOrder(order.ref))?.status).toBe("paid");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.moyasar.com/v1/invoices/${order.invoiceId}`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("sk_test_123:").toString("base64")}`);
  });

  it("refuses to mark paid when the paid amount differs", async () => {
    const order = await makeOrder();
    mockInvoice({ id: order.invoiceId, status: "paid", amount: 100, currency: "SAR", url: "" });
    expect((await moyasar.syncPayment(order)).status).toBe("pending_payment");
  });

  it("refuses a different invoice id or currency", async () => {
    const order = await makeOrder();
    mockInvoice({ id: "someone-elses-invoice", status: "paid", amount: 37900, currency: "SAR", url: "" });
    expect((await moyasar.syncPayment(order)).status).toBe("pending_payment");
    mockInvoice({ id: order.invoiceId, status: "paid", amount: 37900, currency: "USD", url: "" });
    expect((await moyasar.syncPayment(order)).status).toBe("pending_payment");
  });

  it("marks expired invoices as failed and keeps pending ones pending", async () => {
    const a = await makeOrder();
    mockInvoice({ id: a.invoiceId, status: "expired", amount: 37900, currency: "SAR", url: "" });
    expect((await moyasar.syncPayment(a)).status).toBe("payment_failed");
    const b = await makeOrder();
    mockInvoice({ id: b.invoiceId, status: "initiated", amount: 37900, currency: "SAR", url: "" });
    expect((await moyasar.syncPayment(b)).status).toBe("pending_payment");
  });
});

describe("createInvoice", () => {
  it("sends halalas and rejects payment pages outside moyasar.com", async () => {
    const order = await makeOrder(1450.5);
    const fetchMock = mockInvoice({ id: "inv-new-12345", status: "initiated", amount: 145050, currency: "SAR", url: "https://checkout.moyasar.com/invoices/inv-new" });
    const inv = await moyasar.createInvoice(order);
    expect(inv.url).toContain("moyasar.com");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ amount: 145050, currency: "SAR", metadata: { order_ref: order.ref } });
    expect(body.success_url).toBe(`https://shop.example/order/${order.ref}?t=tok`);

    mockInvoice({ id: "inv-evil-12345", status: "initiated", amount: 145050, currency: "SAR", url: "https://moyasar.com.evil.example/pay" });
    await expect(moyasar.createInvoice(order)).rejects.toThrow();
  });
});

describe("webhook token", () => {
  it("accepts only the configured secret", () => {
    expect(moyasar.verifyWebhookToken("whsec_abc")).toBe(true);
    expect(moyasar.verifyWebhookToken("whsec_abd")).toBe(false);
    expect(moyasar.verifyWebhookToken(undefined)).toBe(false);
  });
});
