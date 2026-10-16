import type { MetadataRoute } from "next";
import { products } from "@/lib/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return [
    { url: base, priority: 1 },
    { url: `${base}/shop`, priority: 0.9 },
    { url: `${base}/care`, priority: 0.6 },
    { url: `${base}/contact`, priority: 0.5 },
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, priority: 0.8 })),
  ];
}
