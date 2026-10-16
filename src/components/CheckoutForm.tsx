"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { placeOrder, type CheckoutState } from "@/app/actions/checkout";
import { formatPrice } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { regions } from "@/lib/validation";
import { cart, useCart } from "./cart-store";
import { FormField, Honeypot } from "./FormField";
import { CheckIcon, LockIcon } from "./icons";
import { OrderSummary } from "./OrderSummary";

const initial: CheckoutState = { status: "idle" };
const empty = { name: "", phone: "", email: "", region: "", city: "", district: "", address: "", postalCode: "", notes: "" };
const walletBadges = ["مدى", "Apple Pay", "Visa", "Mastercard", "STC Pay"];

export function CheckoutForm({ onlineEnabled }: { onlineEnabled: boolean }) {
  const lines = useCart();
  const q = quote(lines);
  const [state, action, pending] = useActionState(placeOrder, initial);
  const [values, setValues] = useState(empty);
  const [payment, setPayment] = useState<"online" | "cod">(onlineEnabled ? "online" : "cod");

  useEffect(() => {
    if (state.status === "success") cart.clear();
    // The server only returns URLs on the payment gateway's own domain.
    if (state.status === "redirect") window.location.assign(state.url);
  }, [state]);

  if (state.status === "redirect") {
    return (
      <div className="card mx-auto max-w-lg p-10 text-center" role="status">
        <LockIcon width={36} height={36} className="mx-auto text-brand" />
        <p className="mt-4 text-lg font-bold">جارٍ تحويلك إلى صفحة الدفع الآمنة...</p>
        <p className="mt-2 text-sm text-muted">
          إذا لم يتم التحويل تلقائيًا <a href={state.url} className="font-bold text-brand underline">اضغط هنا</a>.
        </p>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="card mx-auto max-w-lg p-10 text-center" role="status">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
          <CheckIcon width={32} height={32} />
        </span>
        <h2 className="mt-5 text-2xl font-extrabold">تم استلام طلبك بنجاح!</h2>
        <p className="mt-2 text-muted">رقم الطلب</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-widest" dir="ltr">{state.ref}</p>
        <p className="mt-4 leading-7 text-muted">
          الإجمالي {formatPrice(state.total)} شامل ضريبة القيمة المضافة — الدفع عند الاستلام. سيتواصل معك فريقنا خلال 24 ساعة لتأكيد موعد التوصيل.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={state.orderUrl} className="btn-ghost">تفاصيل الطلب</Link>
          <Link href="/shop" className="btn-primary">متابعة التسوق</Link>
        </div>
      </div>
    );
  }

  if (q.lines.length === 0) {
    return (
      <div className="card mx-auto max-w-lg p-10 text-center">
        <p className="text-lg font-bold">السلة فارغة</p>
        <Link href="/shop" className="btn-primary mt-6">تسوّق الآن</Link>
      </div>
    );
  }

  const err = state.status === "error" ? state.fields ?? {} : {};
  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_340px]" noValidate>
      <div className="card relative space-y-5 p-6">
        <h2 className="text-lg font-extrabold">بيانات التوصيل</h2>

        {state.status === "error" && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger">
            {state.message}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField name="name" label="الاسم بالكامل" error={err.name}>
            {(p) => <input {...p} className="field" autoComplete="name" required maxLength={80} value={values.name} onChange={set} />}
          </FormField>
          <FormField name="phone" label="رقم الجوال" error={err.phone} hint="مثال: 0551234567">
            {(p) => (
              <input {...p} className="field text-left" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" required maxLength={16} value={values.phone} onChange={set} />
            )}
          </FormField>
          <FormField name="email" label="البريد الإلكتروني (اختياري)" error={err.email}>
            {(p) => <input {...p} className="field text-left" dir="ltr" type="email" autoComplete="email" maxLength={120} value={values.email} onChange={set} />}
          </FormField>
          <FormField name="region" label="المنطقة" error={err.region}>
            {(p) => (
              <select {...p} className="field" required value={values.region} onChange={set}>
                <option value="" disabled>اختر المنطقة</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </FormField>
          <FormField name="city" label="المدينة" error={err.city}>
            {(p) => <input {...p} className="field" autoComplete="address-level2" required maxLength={60} value={values.city} onChange={set} />}
          </FormField>
          <FormField name="district" label="الحي" error={err.district}>
            {(p) => <input {...p} className="field" autoComplete="address-level3" required maxLength={60} value={values.district} onChange={set} />}
          </FormField>
          <FormField name="postalCode" label="الرمز البريدي (اختياري)" error={err.postalCode} hint="من العنوان الوطني — 5 أرقام">
            {(p) => (
              <input {...p} className="field text-left" dir="ltr" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={values.postalCode} onChange={set} />
            )}
          </FormField>
          <div className="sm:col-span-2">
            <FormField name="address" label="الشارع ورقم المبنى" error={err.address} hint="مثال: طريق الملك فهد، مبنى 2451، شقة 7">
              {(p) => <input {...p} className="field" autoComplete="street-address" required maxLength={250} value={values.address} onChange={set} />}
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField name="notes" label="ملاحظات (اختياري)" error={err.notes}>
              {(p) => <textarea {...p} className="field min-h-24" maxLength={500} value={values.notes} onChange={set} />}
            </FormField>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-bold">طريقة الدفع</legend>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 has-checked:border-brand has-checked:bg-brand-soft/50 ${
              onlineEnabled ? "border-line" : "cursor-not-allowed border-line opacity-60"
            }`}
          >
            <input
              type="radio"
              name="payment"
              value="online"
              checked={payment === "online"}
              onChange={() => setPayment("online")}
              disabled={!onlineEnabled}
              className="mt-1.5 accent-brand"
            />
            <span className="flex-1">
              <span className="font-semibold">الدفع الإلكتروني</span>
              <span className="mt-2 flex flex-wrap gap-1.5" aria-label="وسائل الدفع المدعومة">
                {walletBadges.map((b) => (
                  <span key={b} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-bold" dir="ltr">{b}</span>
                ))}
              </span>
              <span className="mt-2 block text-xs text-muted">
                {onlineEnabled ? "ستنتقل إلى صفحة دفع آمنة ومشفّرة من ميسّر — لا نحفظ بيانات بطاقتك." : "غير متاح حاليًا."}
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-4 has-checked:border-brand has-checked:bg-brand-soft/50">
            <input type="radio" name="payment" value="cod" checked={payment === "cod"} onChange={() => setPayment("cod")} className="accent-brand" />
            <span className="font-semibold">الدفع عند الاستلام (نقدًا أو مدى)</span>
          </label>
          {err.payment && <p className="text-sm font-semibold text-danger">{err.payment}</p>}
        </fieldset>

        <input type="hidden" name="items" value={JSON.stringify(lines)} />
        <Honeypot />
      </div>

      <OrderSummary q={q}>
        <ul className="space-y-2 border-t border-line pt-3 text-sm">
          {q.lines.map((l) => (
            <li key={l.product.slug} className="flex justify-between gap-2">
              <span className="text-muted">{l.product.name} × {l.qty}</span>
              <span className="shrink-0 font-semibold">{formatPrice(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={pending}>
          {pending ? "جارٍ إرسال الطلب..." : payment === "online" ? `ادفع ${formatPrice(q.total)}` : "تأكيد الطلب"}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <LockIcon width={14} height={14} /> بياناتك مشفّرة ولا تُشارك مع أي طرف
        </p>
      </OrderSummary>
    </form>
  );
}
