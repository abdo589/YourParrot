import type { Metadata } from "next";
import { CheckoutForm } from "@/components/CheckoutForm";

export const metadata: Metadata = { title: "إتمام الطلب", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="container-x py-10">
      <h1 className="mb-8 text-3xl font-extrabold">إتمام الطلب</h1>
      <CheckoutForm />
    </div>
  );
}
