import { z } from "zod";
import { MAX_QTY_PER_ITEM } from "./products";

export const governorates = [
  "القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الشرقية", "الدقهلية", "الغربية",
  "المنوفية", "البحيرة", "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية", "السويس",
  "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان",
  "البحر الأحمر", "مطروح", "شمال سيناء", "جنوب سيناء", "الوادي الجديد",
] as const;

/** Removes control characters (except newlines/tabs) and trims. */
function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g, "").trim();
}

const text = (min: number, max: number, minMsg: string) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().min(min, minMsg).max(max, `الحد الأقصى ${max} حرف`));

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .default("")
    .transform(clean)
    .pipe(z.string().max(max, `الحد الأقصى ${max} حرف`));

/** Egyptian mobile numbers: 01[0125]XXXXXXXX, optionally prefixed with +20 / 0020. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+20|0020)/, "0"))
  .pipe(z.string().regex(/^01[0125]\d{8}$/, "رقم موبايل مصري غير صحيح"));

export const cartLineSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  qty: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const cartSchema = z.array(cartLineSchema).max(30);

export type CartLine = z.infer<typeof cartLineSchema>;

export const checkoutSchema = z.object({
  name: text(3, 80, "الاسم مطلوب (3 أحرف على الأقل)"),
  phone: phoneSchema,
  email: z
    .string()
    .optional()
    .default("")
    .transform(clean)
    .pipe(z.union([z.literal(""), z.email("بريد إلكتروني غير صحيح").max(120)])),
  governorate: z.enum(governorates, { error: "اختر المحافظة" }),
  city: text(2, 60, "المدينة / المنطقة مطلوبة"),
  address: text(10, 250, "اكتب العنوان بالتفصيل (10 أحرف على الأقل)"),
  notes: optionalText(500),
  items: cartSchema.min(1, "السلة فارغة"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const contactSchema = z.object({
  name: text(2, 80, "الاسم مطلوب"),
  phone: phoneSchema,
  message: text(10, 1500, "الرسالة قصيرة جدًا (10 أحرف على الأقل)"),
});

export type ContactInput = z.infer<typeof contactSchema>;

export type FieldErrors = Partial<Record<string, string>>;

/** Flattens a zod error into the first message per top-level field. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
