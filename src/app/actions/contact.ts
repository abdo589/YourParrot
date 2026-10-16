"use server";

import { randomUUID } from "node:crypto";
import { contactSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { limits } from "@/server/limits";
import { clientIp } from "@/server/request";
import { saveMessage } from "@/server/store";

export type ContactState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: FieldErrors }
  | { status: "success" };

export async function sendMessage(_prev: ContactState, form: FormData): Promise<ContactState> {
  if (form.get("website")) return { status: "success" };

  const rl = limits.contact.check(`contact:${await clientIp()}`);
  if (!rl.ok) return { status: "error", message: "أرسلت رسائل كثيرة. حاول لاحقًا." };

  const parsed = contactSchema.safeParse({
    name: form.get("name") ?? "",
    phone: form.get("phone") ?? "",
    message: form.get("message") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "راجع البيانات المطلوبة.", fields: fieldErrors(parsed.error) };
  }

  try {
    await saveMessage({ id: randomUUID(), createdAt: new Date().toISOString(), ...parsed.data });
  } catch (err) {
    console.error("[contact] failed to save message", err);
    return { status: "error", message: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
  return { status: "success" };
}
