import { z } from "zod";
import { MAX_QTY_PER_ITEM } from "./products";

export const regions = [
  "الرياض", "مكة المكرمة", "المدينة المنورة", "القصيم", "المنطقة الشرقية", "عسير", "تبوك",
  "حائل", "الحدود الشمالية", "جازان", "نجران", "الباحة", "الجوف",
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

/** Converts Arabic-Indic / Persian digits to ASCII so "٠٥٥..." is accepted. */
function asciiDigits(v: string): string {
  return v.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** Saudi mobile numbers: 05XXXXXXXX, also accepts +966 / 00966 / 966 prefixes. Normalised to 05XXXXXXXX. */
export const phoneSchema = z
  .string()
  .transform((v) => asciiDigits(v).replace(/[\s()-]/g, "").replace(/^(\+966|00966|966)(?=5)/, "0"))
  .pipe(z.string().regex(/^05\d{8}$/, "رقم جوال سعودي غير صحيح (مثال: 0551234567)"));

/** Saudi postal code (national address): 5 digits, optional. */
const postalCodeSchema = z
  .string()
  .optional()
  .default("")
  .transform((v) => asciiDigits(v).replace(/\s/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{5}$/, "الرمز البريدي 5 أرقام")]));

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
  region: z.enum(regions, { error: "اختر المنطقة" }),
  city: text(2, 60, "المدينة مطلوبة"),
  district: text(2, 60, "الحي مطلوب"),
  address: text(5, 250, "اكتب الشارع ورقم المبنى"),
  postalCode: postalCodeSchema,
  notes: optionalText(500),
  payment: z.enum(["cod", "online"], { error: "اختر طريقة الدفع" }),
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
