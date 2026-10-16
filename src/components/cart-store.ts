"use client";

import { useSyncExternalStore } from "react";
import { getProduct, MAX_QTY_PER_ITEM } from "@/lib/products";
import { cartSchema, type CartLine } from "@/lib/validation";

const KEY = "yp-cart-v1";
const EMPTY: CartLine[] = [];

let lines: CartLine[] | null = null;
const listeners = new Set<() => void>();

/** Reads and validates the persisted cart; anything malformed is dropped. */
function load(): CartLine[] {
  try {
    const parsed = cartSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    if (!parsed.success) return [];
    return parsed.data.filter((l) => getProduct(l.slug));
  } catch {
    return [];
  }
}

function current(): CartLine[] {
  if (lines === null) lines = load();
  return lines;
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable (private mode) — cart still works in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      lines = load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function clampQty(slug: string, qty: number) {
  const stock = getProduct(slug)?.stock ?? 0;
  return Math.max(0, Math.min(qty, stock, MAX_QTY_PER_ITEM));
}

export const cart = {
  add(slug: string, qty = 1) {
    const existing = current().find((l) => l.slug === slug);
    const nextQty = clampQty(slug, (existing?.qty ?? 0) + qty);
    if (nextQty === 0) return;
    commit(
      existing
        ? current().map((l) => (l.slug === slug ? { ...l, qty: nextQty } : l))
        : [...current(), { slug, qty: nextQty }],
    );
  },
  setQty(slug: string, qty: number) {
    const q = clampQty(slug, qty);
    commit(q === 0 ? current().filter((l) => l.slug !== slug) : current().map((l) => (l.slug === slug ? { ...l, qty: q } : l)));
  },
  remove(slug: string) {
    commit(current().filter((l) => l.slug !== slug));
  },
  clear() {
    commit([]);
  },
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, current, () => EMPTY);
}

export function useCartCount(): number {
  return useCart().reduce((n, l) => n + l.qty, 0);
}
