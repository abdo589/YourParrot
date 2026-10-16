import { describe, expect, it } from "vitest";
import { checkoutSchema, phoneSchema } from "@/lib/validation";

const valid = {
  name: "أحمد علي",
  phone: "01012345678",
  email: "",
  governorate: "القاهرة",
  city: "مدينة نصر",
  address: "شارع عباس العقاد، عمارة 12، الدور 3",
  notes: "",
  items: [{ slug: "budgie", qty: 1 }],
};

describe("phoneSchema", () => {
  it.each(["01012345678", "+201112345678", "0020 122 345 6789", "015-1234-5678"])("accepts %s", (p) => {
    expect(phoneSchema.safeParse(p).success).toBe(true);
  });
  it.each(["0101234567", "01312345678", "12345678901", "<script>"])("rejects %s", (p) => {
    expect(phoneSchema.safeParse(p).success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("accepts a valid order", () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
  });

  it("strips control and bidi-override characters", () => {
    const r = checkoutSchema.parse({ ...valid, name: "  أحمد‮\u0000 علي " });
    expect(r.name).toBe("أحمد علي");
  });

  it("rejects unknown governorates, oversize fields and bad cart items", () => {
    expect(checkoutSchema.safeParse({ ...valid, governorate: "Atlantis" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, notes: "x".repeat(501) }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, items: [{ slug: "budgie", qty: 0 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, items: [{ slug: "../etc", qty: 1 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, items: [{ slug: "budgie", qty: 1, price: 1 }] }).data?.items[0]).toEqual({
      slug: "budgie",
      qty: 1,
    });
  });
});
