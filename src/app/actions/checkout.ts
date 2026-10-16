"use server";

import { randomBytes } from "node:crypto";
import { quote } from "@/lib/pricing";
import { checkoutSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { limits } from "@/server/limits";
import { clientIp } from "@/server/request";
import { createInvoice, onlinePaymentsEnabled } from "@/server/moyasar";
import { saveOrder, updateOrder, type OrderRecord } from "@/server/store";

export type CheckoutState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: FieldErrors }
  | { status: "success"; ref: string; total: number; orderUrl: string }
  | { status: "redirect"; url: string };

function parseItems(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || raw.length > 4000) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function placeOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  // Honeypot: real users never fill this hidden field.
  if (form.get("website")) return { status: "success", ref: "YP-000000", total: 0, orderUrl: "/" };

  const rl = limits.checkout.check(`checkout:${await clientIp()}`);
  if (!rl.ok) {
    return { status: "error", message: `محاولات كثيرة. حاول مرة أخرى بعد ${Math.ceil(rl.retryAfter / 60)} دقيقة.` };
  }

  const parsed = checkoutSchema.safeParse({
    name: form.get("name") ?? "",
    phone: form.get("phone") ?? "",
    email: form.get("email") ?? "",
    region: form.get("region") ?? "",
    city: form.get("city") ?? "",
    district: form.get("district") ?? "",
    address: form.get("address") ?? "",
    postalCode: form.get("postalCode") ?? "",
    notes: form.get("notes") ?? "",
    payment: form.get("payment") ?? "",
    items: parseItems(form.get("items")),
  });

  if (!parsed.success) {
    return { status: "error", message: "راجع البيانات المطلوبة.", fields: fieldErrors(parsed.error) };
  }

  const { items, payment, ...customer } = parsed.data;
  if (payment === "online" && !onlinePaymentsEnabled()) {
    return { status: "error", message: "الدفع الإلكتروني غير متاح حاليًا، اختر الدفع عند الاستلام." };
  }

  const q = quote(items);
  if (q.problems.length > 0 || q.lines.length === 0) {
    return {
      status: "error",
      message: "بعض المنتجات في السلة لم تعد متاحة بالكمية المطلوبة. حدّث السلة وحاول مرة أخرى.",
    };
  }

  const order: OrderRecord = {
    ref: `YP-${randomBytes(4).toString("hex").toUpperCase()}`,
    createdAt: new Date().toISOString(),
    customer,
    items: q.lines.map((l) => ({
      slug: l.product.slug,
      name: l.product.name,
      qty: l.qty,
      unitPrice: l.product.price,
      lineTotal: l.lineTotal,
    })),
    subtotal: q.subtotal,
    shipping: q.shipping,
    total: q.total,
    vat: q.vat,
    payment,
    status: payment === "online" ? "pending_payment" : "new",
    accessToken: randomBytes(18).toString("base64url"),
  };

  try {
    await saveOrder(order);
  } catch (err) {
    console.error("[checkout] failed to save order", err);
    return { status: "error", message: "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل." };
  }

  if (payment === "cod") {
    return { status: "success", ref: order.ref, total: order.total, orderUrl: `/order/${order.ref}?t=${order.accessToken}` };
  }

  try {
    const invoice = await createInvoice(order);
    await updateOrder(order.ref, () => ({ invoiceId: invoice.id, invoiceUrl: invoice.url }));
    return { status: "redirect", url: invoice.url };
  } catch (err) {
    console.error("[checkout] failed to create payment invoice", err);
    await updateOrder(order.ref, () => ({ status: "payment_failed" })).catch(() => undefined);
    return { status: "error", message: "تعذّر بدء عملية الدفع الإلكتروني. حاول مرة أخرى أو اختر الدفع عند الاستلام." };
  }
}
