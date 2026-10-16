import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClearCart } from "@/components/ClearCart";
import { CheckIcon, CloseIcon, LockIcon } from "@/components/icons";
import { formatDate, formatPrice } from "@/lib/format";
import { limits } from "@/server/limits";
import { safeTokenEqual, syncPayment } from "@/server/moyasar";
import { clientIp } from "@/server/request";
import { getOrder, type OrderRecord } from "@/server/store";

export const metadata: Metadata = { title: "حالة الطلب", robots: { index: false, follow: false } };

const statusView: Record<OrderRecord["status"], { title: string; text: string; tone: "ok" | "wait" | "bad" }> = {
  new: { title: "تم استلام طلبك بنجاح!", text: "الدفع عند الاستلام. سيتواصل معك فريقنا خلال 24 ساعة لتأكيد موعد التوصيل.", tone: "ok" },
  paid: { title: "تم الدفع بنجاح، شكرًا لك!", text: "طلبك مدفوع ومؤكَّد. سيتواصل معك فريقنا خلال 24 ساعة لتأكيد موعد التوصيل.", tone: "ok" },
  pending_payment: { title: "بانتظار تأكيد الدفع", text: "لم يصلنا تأكيد الدفع بعد. إذا أكملت الدفع للتو، حدّث الصفحة بعد لحظات.", tone: "wait" },
  payment_failed: { title: "لم تكتمل عملية الدفع", text: "لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى أو اختيار الدفع عند الاستلام.", tone: "bad" },
};

export default async function OrderPage({ params, searchParams }: PageProps<"/order/[ref]">) {
  const { ref } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : undefined;

  if (!/^YP-[A-F0-9]{8}$/.test(ref) || !limits.orderView.check(`order:${await clientIp()}`).ok) notFound();

  let order = await getOrder(ref);
  // The access token proves this is the customer's own order; respond 404 otherwise
  // so order references can't be enumerated.
  if (!order || !safeTokenEqual(order.accessToken, token)) notFound();

  if (order.status === "pending_payment") {
    order = await syncPayment(order).catch((err) => {
      console.error("[order] payment sync failed", err);
      return order!;
    });
  }

  const view = statusView[order.status];
  const confirmed = order.status === "new" || order.status === "paid";
  const selfUrl = `/order/${order.ref}?t=${encodeURIComponent(token!)}`;

  return (
    <div className="container-x max-w-2xl py-12">
      {confirmed && <ClearCart />}
      <div className="card p-8 text-center" role="status">
        <span
          className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ${
            view.tone === "ok" ? "bg-brand-soft text-brand" : view.tone === "bad" ? "bg-danger/10 text-danger" : "bg-mango/20 text-mango"
          }`}
        >
          {view.tone === "ok" ? <CheckIcon width={32} height={32} /> : view.tone === "bad" ? <CloseIcon width={32} height={32} /> : <LockIcon width={30} height={30} />}
        </span>
        <h1 className="mt-5 text-2xl font-extrabold">{view.title}</h1>
        <p className="mt-2 text-muted">رقم الطلب</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-widest" dir="ltr">{order.ref}</p>
        <p className="mx-auto mt-4 max-w-md leading-7 text-muted">{view.text}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {order.status === "pending_payment" && (
            <>
              <Link href={selfUrl} className="btn-primary">تحديث الحالة</Link>
              {order.invoiceUrl && <a href={order.invoiceUrl} className="btn-ghost">إكمال الدفع</a>}
            </>
          )}
          {order.status === "payment_failed" && <Link href="/checkout" className="btn-primary">المحاولة مرة أخرى</Link>}
          {confirmed && <Link href="/shop" className="btn-primary">متابعة التسوق</Link>}
        </div>
      </div>

      <section className="card mt-6 p-6" aria-labelledby="details">
        <h2 id="details" className="mb-4 font-extrabold">تفاصيل الطلب</h2>
        <ul className="space-y-2 text-sm">
          {order.items.map((i) => (
            <li key={i.slug} className="flex justify-between gap-3">
              <span>{i.name} × {i.qty}</span>
              <span className="font-semibold">{formatPrice(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">الشحن</dt><dd>{order.shipping ? formatPrice(order.shipping) : "مجاني"}</dd></div>
          <div className="flex justify-between text-base font-extrabold"><dt>الإجمالي</dt><dd className="text-brand">{formatPrice(order.total)}</dd></div>
          <div className="flex justify-between text-xs text-muted"><dt>يشمل ضريبة القيمة المضافة (15%)</dt><dd>{formatPrice(order.vat)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">طريقة الدفع</dt><dd>{order.payment === "online" ? "دفع إلكتروني (مدى / Apple Pay / بطاقة)" : "الدفع عند الاستلام"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">التاريخ</dt><dd>{formatDate(order.createdAt)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">التوصيل إلى</dt><dd className="text-left">{order.customer.city}، {order.customer.district}</dd></div>
        </dl>
      </section>
      <p className="mt-4 text-center text-xs text-muted">احتفظ برابط هذه الصفحة لمتابعة حالة طلبك.</p>
    </div>
  );
}
