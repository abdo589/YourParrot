import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/admin";
import { formatDate, formatPrice } from "@/lib/format";
import { isAdmin } from "@/server/session";
import { listMessages, listOrders } from "@/server/store";

export const metadata: Metadata = { title: "لوحة التحكم", robots: { index: false, follow: false } };

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [orders, messages] = await Promise.all([listOrders(), listMessages()]);
  const revenue = orders.reduce((s, o) => s + o.total, 0);

  return (
    <div className="container-x space-y-10 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">لوحة التحكم</h1>
        <form action={logout}><button className="btn-ghost">تسجيل الخروج</button></form>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><dt className="text-sm text-muted">عدد الطلبات</dt><dd className="text-2xl font-extrabold">{orders.length}</dd></div>
        <div className="card p-5"><dt className="text-sm text-muted">إجمالي المبيعات</dt><dd className="text-2xl font-extrabold">{formatPrice(revenue)}</dd></div>
        <div className="card p-5"><dt className="text-sm text-muted">الرسائل</dt><dd className="text-2xl font-extrabold">{messages.length}</dd></div>
      </dl>

      <section aria-labelledby="orders">
        <h2 id="orders" className="mb-4 text-xl font-extrabold">الطلبات</h2>
        {orders.length === 0 ? (
          <p className="card p-6 text-muted">لا توجد طلبات بعد.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-right">
                <tr>
                  <th className="p-3">رقم الطلب</th><th className="p-3">التاريخ</th><th className="p-3">العميل</th>
                  <th className="p-3">العنوان</th><th className="p-3">المنتجات</th><th className="p-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.ref} className="align-top">
                    <td className="p-3 font-mono" dir="ltr">{o.ref}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                    <td className="p-3">{o.customer.name}<div className="text-muted" dir="ltr">{o.customer.phone}</div></td>
                    <td className="p-3">
                      {o.customer.region} — {o.customer.city}، {o.customer.district}
                      <div className="text-muted">{o.customer.address}{o.customer.postalCode && ` — ${o.customer.postalCode}`}</div>
                    </td>
                    <td className="p-3">{o.items.map((i) => <div key={i.slug}>{i.name} × {i.qty}</div>)}</td>
                    <td className="p-3 font-bold">
                      {formatPrice(o.total)}
                      <div className="text-xs font-normal text-muted">ضريبة {formatPrice(o.vat ?? 0)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="msgs">
        <h2 id="msgs" className="mb-4 text-xl font-extrabold">الرسائل</h2>
        {messages.length === 0 ? (
          <p className="card p-6 text-muted">لا توجد رسائل.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="card p-5">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-bold">{m.name} <span className="font-normal text-muted" dir="ltr">{m.phone}</span></span>
                  <span className="text-muted">{formatDate(m.createdAt)}</span>
                </div>
                <p className="mt-2 leading-7 whitespace-pre-wrap">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
