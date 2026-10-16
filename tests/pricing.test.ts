import { describe, expect, it } from "vitest";
import { FREE_SHIPPING_THRESHOLD, quote, SHIPPING_FEE } from "@/lib/pricing";
import { getProduct } from "@/lib/products";

describe("quote", () => {
  it("prices from the catalog and adds shipping under the threshold", () => {
    const toy = getProduct("rope-swing")!;
    const q = quote([{ slug: "rope-swing", qty: 2 }]);
    expect(q.subtotal).toBe(toy.price * 2);
    expect(q.shipping).toBe(SHIPPING_FEE);
    expect(q.total).toBe(toy.price * 2 + SHIPPING_FEE);
    expect(q.problems).toEqual([]);
  });

  it("gives free shipping at or above the threshold", () => {
    const q = quote([{ slug: "african-grey", qty: 1 }]);
    expect(q.subtotal).toBeGreaterThanOrEqual(FREE_SHIPPING_THRESHOLD);
    expect(q.shipping).toBe(0);
  });

  it("merges duplicate lines and flags quantities above stock", () => {
    const q = quote([
      { slug: "african-grey", qty: 1 },
      { slug: "african-grey", qty: 2 },
    ]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].qty).toBe(3);
    expect(q.problems).toEqual([{ slug: "african-grey", reason: "stock" }]);
  });

  it("flags unknown products", () => {
    expect(quote([{ slug: "dragon", qty: 1 }]).problems).toEqual([{ slug: "dragon", reason: "unknown" }]);
  });
});
