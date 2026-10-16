"use server";

import { randomBytes } from "node:crypto";
import { quote } from "@/lib/pricing";
import { checkoutSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { limits } from "@/server/limits";
import { clientIp } from "@/server/request";
import { saveOrder } from "@/server/store";

export type CheckoutState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: FieldErrors }
  | { status: "success"; ref: string; total: number };

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
  if (form.get("website")) return { status: "success", ref: "YP-000000", total: 0 };

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
    items: parseItems(form.get("items")),
  });

  if (!parsed.success) {
    return { status: "error", message: "راجع البيانات المطلوبة.", fields: fieldErrors(parsed.error) };
  }

  const { items, ...customer } = parsed.data;
  const q = quote(items);
  if (q.problems.length > 0 || q.lines.length === 0) {
    return {
      status: "error",
      message: "بعض المنتجات في السلة لم تعد متاحة بالكمية المطلوبة. حدّث السلة وحاول مرة أخرى.",
    };
  }

  const ref = `YP-${randomBytes(4).toString("hex").toUpperCase()}`;

  try {
    await saveOrder({
      ref,
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
      payment: "cod",
      status: "new",
    });
  } catch (err) {
    console.error("[checkout] failed to save order", err);
    return { status: "error", message: "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل." };
  }

  return { status: "success", ref, total: q.total };
}
