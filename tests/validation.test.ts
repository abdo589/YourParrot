import { describe, expect, it } from "vitest";
import { checkoutSchema, phoneSchema } from "@/lib/validation";

const valid = {
  name: "عبدالله القحطاني",
  phone: "0551234567",
  email: "",
  region: "الرياض",
  city: "الرياض",
  district: "العليا",
  address: "طريق الملك فهد، مبنى 2451",
  postalCode: "12211",
  payment: "cod",
  notes: "",
  items: [{ slug: "budgie", qty: 1 }],
};

describe("phoneSchema", () => {
  it.each(["0551234567", "+966551234567", "00966 50 123 4567", "966541234567", "055-123-4567", "٠٥٥١٢٣٤٥٦٧"])("accepts %s", (p) => {
    expect(phoneSchema.parse(p)).toMatch(/^05\d{8}$/);
  });
  it.each(["055123456", "0151234567", "+9660551234567", "01012345678", "<script>"])("rejects %s", (p) => {
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

  it("validates the optional postal code", () => {
    expect(checkoutSchema.safeParse({ ...valid, postalCode: "" }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...valid, postalCode: "1234" }).success).toBe(false);
  });

  it("rejects unknown regions, oversize fields and bad cart items", () => {
    expect(checkoutSchema.safeParse({ ...valid, region: "Atlantis" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, payment: "crypto" }).success).toBe(false);
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
