"use client";

import Link from "next/link";
import { useCartCount } from "./cart-store";
import { CartIcon } from "./icons";

export function CartBadge() {
  const count = useCartCount();
  return (
    <Link
      href="/cart"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface hover:border-brand hover:text-brand"
      aria-label={count ? `السلة: ${count} منتج` : "السلة فارغة"}
    >
      <CartIcon />
      {count > 0 && (
        <span className="absolute -top-1 -left-1 min-w-5 rounded-full bg-coral px-1 text-center text-xs font-bold leading-5 text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
