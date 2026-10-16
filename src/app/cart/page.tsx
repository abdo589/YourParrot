import type { Metadata } from "next";
import { CartView } from "@/components/CartView";

export const metadata: Metadata = { title: "سلة المشتريات", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-x py-10">
      <h1 className="mb-8 text-3xl font-extrabold">سلة المشتريات</h1>
      <CartView />
    </div>
  );
}
