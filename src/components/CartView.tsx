"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { MAX_QTY_PER_ITEM } from "@/lib/products";
import { cart, useCart } from "./cart-store";
import { CartIcon, TrashIcon } from "./icons";
import { OrderSummary } from "./OrderSummary";
import { ProductArt } from "./ProductArt";

export function CartView() {
  const lines = useCart();
  const q = quote(lines);

  if (q.lines.length === 0) {
    return (
      <div className="card mx-auto max-w-lg p-12 text-center">
        <CartIcon width={48} height={48} className="mx-auto text-muted" />
        <p className="mt-4 text-lg font-bold">سلتك فارغة</p>
        <p className="mt-1 text-muted">ابدأ التسوق وأضف ما يحتاجه طائرك.</p>
        <Link href="/shop" className="btn-primary mt-6">تسوّق الآن</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {q.lines.map(({ product, qty, lineTotal }) => {
          const max = Math.min(product.stock, MAX_QTY_PER_ITEM);
          return (
            <li key={product.slug} className="card flex gap-4 p-4">
              <Link href={`/product/${product.slug}`} className="w-24 shrink-0 sm:w-28">
                <ProductArt kind={product.art} palette={product.palette} label={product.name} className="w-full" />
              </Link>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/product/${product.slug}`} className="font-bold hover:text-brand">{product.name}</Link>
                  <button
                    type="button"
                    onClick={() => cart.remove(product.slug)}
                    className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={`حذف ${product.name} من السلة`}
                  >
                    <TrashIcon width={18} height={18} />
                  </button>
                </div>
                <div className="text-sm text-muted">{formatPrice(product.price)} للقطعة</div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-full border border-line" role="group" aria-label={`كمية ${product.name}`}>
                    <button type="button" className="h-9 w-9 text-lg font-bold disabled:opacity-40" onClick={() => cart.setQty(product.slug, qty + 1)} disabled={qty >= max} aria-label="زيادة">+</button>
                    <span className="w-8 text-center font-bold" aria-live="polite">{qty}</span>
                    <button type="button" className="h-9 w-9 text-lg font-bold" onClick={() => cart.setQty(product.slug, qty - 1)} aria-label="إنقاص">−</button>
                  </div>
                  <div className="font-extrabold">{formatPrice(lineTotal)}</div>
                </div>
                {qty > product.stock && <p className="text-xs text-danger">الكمية المتاحة {product.stock} فقط</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <OrderSummary q={q}>
        <Link href="/checkout" className="btn-primary w-full py-3 text-base">إتمام الطلب</Link>
        <Link href="/shop" className="block text-center text-sm font-semibold text-brand hover:underline">متابعة التسوق</Link>
      </OrderSummary>
    </div>
  );
}
