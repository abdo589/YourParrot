import { getProduct, type Product } from "./products";
import type { CartLine } from "./validation";

export const SHIPPING_FEE = 90;
export const FREE_SHIPPING_THRESHOLD = 3000;

export interface PricedLine {
  product: Product;
  qty: number;
  lineTotal: number;
}

export interface Quote {
  lines: PricedLine[];
  subtotal: number;
  shipping: number;
  total: number;
  /** Slugs that no longer exist or exceed available stock. */
  problems: { slug: string; reason: "unknown" | "stock" }[];
}

/**
 * Prices a cart using the catalog only. Client-supplied prices are never used,
 * so the total cannot be tampered with from the browser.
 */
export function quote(items: CartLine[]): Quote {
  const merged = new Map<string, number>();
  for (const { slug, qty } of items) merged.set(slug, (merged.get(slug) ?? 0) + qty);

  const lines: PricedLine[] = [];
  const problems: Quote["problems"] = [];

  for (const [slug, qty] of merged) {
    const product = getProduct(slug);
    if (!product) {
      problems.push({ slug, reason: "unknown" });
      continue;
    }
    if (qty > product.stock) problems.push({ slug, reason: "stock" });
    lines.push({ product, qty, lineTotal: product.price * qty });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { lines, subtotal, shipping, total: subtotal + shipping, problems };
}
