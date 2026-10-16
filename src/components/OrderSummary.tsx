import { formatPrice } from "@/lib/format";
import { FREE_SHIPPING_THRESHOLD, type Quote } from "@/lib/pricing";

export function OrderSummary({ q, children }: { q: Quote; children?: React.ReactNode }) {
  const remaining = FREE_SHIPPING_THRESHOLD - q.subtotal;
  return (
    <aside className="card h-fit space-y-4 p-6 lg:sticky lg:top-24" aria-label="ملخص الطلب">
      <h2 className="text-lg font-extrabold">ملخص الطلب</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted">المجموع الفرعي</dt><dd className="font-semibold">{formatPrice(q.subtotal)}</dd></div>
        <div className="flex justify-between">
          <dt className="text-muted">الشحن</dt>
          <dd className="font-semibold">{q.shipping === 0 ? "مجاني" : formatPrice(q.shipping)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-base">
          <dt className="font-bold">الإجمالي</dt><dd className="font-extrabold text-brand">{formatPrice(q.total)}</dd>
        </div>
        <div className="flex justify-between text-xs text-muted">
          <dt>يشمل ضريبة القيمة المضافة (15%)</dt><dd>{formatPrice(q.vat)}</dd>
        </div>
      </dl>
      {remaining > 0 && q.subtotal > 0 && (
        <p className="rounded-xl bg-brand-soft p-3 text-xs font-semibold text-brand">
          أضف منتجات بـ {formatPrice(remaining)} للحصول على شحن مجاني.
        </p>
      )}
      {children}
    </aside>
  );
}
