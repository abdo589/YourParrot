"use client";

import { useEffect, useState } from "react";
import { getProduct } from "@/lib/products";
import { cart, useCart } from "./cart-store";
import { CartIcon, CheckIcon } from "./icons";

interface Props {
  slug: string;
  name: string;
  qty?: number;
  compact?: boolean;
}

export function AddToCartButton({ slug, name, qty = 1, compact }: Props) {
  const [added, setAdded] = useState(false);
  const inCart = useCart().find((l) => l.slug === slug)?.qty ?? 0;
  const stock = getProduct(slug)?.stock ?? 0;
  const soldOut = stock === 0 || inCart >= Math.min(stock, 10);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1600);
    return () => clearTimeout(t);
  }, [added]);

  return (
    <>
      <button
        type="button"
        disabled={soldOut}
        onClick={() => {
          cart.add(slug, qty);
          setAdded(true);
        }}
        className={compact ? "btn-primary px-4" : "btn-primary w-full py-3 text-base"}
        aria-label={compact ? `أضف ${name} إلى السلة` : undefined}
      >
        {added ? <CheckIcon /> : <CartIcon />}
        {compact ? (added ? "تمت" : "أضف") : soldOut ? "وصلت للحد المتاح" : added ? "تمت الإضافة للسلة" : "أضف إلى السلة"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {added ? `تمت إضافة ${name} إلى السلة` : ""}
      </span>
    </>
  );
}
