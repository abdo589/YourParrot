import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductArt } from "@/components/ProductArt";
import { ProductCard } from "@/components/ProductCard";
import { CheckIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { getCategory, getProduct, products } from "@/lib/products";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  return { title: product.name, description: product.short };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const product = getProduct((await params).slug);
  if (!product) notFound();

  const category = getCategory(product.category)!;
  const related = products.filter((p) => p.category === product.category && p.slug !== product.slug).slice(0, 4);
  const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;

  return (
    <div className="container-x py-10">
      <nav aria-label="مسار التنقل" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap gap-2">
          <li><Link href="/" className="hover:text-brand">الرئيسية</Link> /</li>
          <li><Link href={`/shop?c=${category.id}`} className="hover:text-brand">{category.name}</Link> /</li>
          <li aria-current="page" className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="card overflow-hidden p-4">
          <ProductArt kind={product.art} palette={product.palette} label={product.name} className="w-full" />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            {product.badge && (
              <span className="inline-block rounded-full bg-mango px-3 py-1 text-xs font-bold text-black">{product.badge}</span>
            )}
            <h1 className="text-3xl leading-snug font-extrabold">{product.name}</h1>
            <p className="text-lg text-muted">{product.short}</p>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-brand">{formatPrice(product.price)}</span>
            <span className="text-xs text-muted">شامل الضريبة</span>
            {product.oldPrice && (
              <>
                <span className="text-muted line-through">{formatPrice(product.oldPrice)}</span>
                <span className="rounded-full bg-coral/15 px-2 py-0.5 text-sm font-bold text-coral">خصم {discount}%</span>
              </>
            )}
          </div>

          <p className="text-sm font-semibold">
            {product.stock > 0 ? (
              <span className="text-brand">متوفر ({product.stock} {product.stock <= 3 ? "فقط" : "قطعة"})</span>
            ) : (
              <span className="text-danger">غير متوفر حاليًا</span>
            )}
          </p>

          <div className="max-w-sm">
            <AddToCartButton slug={product.slug} name={product.name} />
          </div>

          <p className="leading-8">{product.description}</p>

          <ul className="grid gap-2 sm:grid-cols-2">
            {product.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <CheckIcon width={14} height={14} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <dl className="card divide-y divide-line">
            {product.specs.map((s) => (
              <div key={s.label} className="flex justify-between gap-4 px-5 py-3 text-sm">
                <dt className="text-muted">{s.label}</dt>
                <dd className="font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3"><TruckIcon className="text-brand" /> الدفع عند الاستلام والمعاينة</div>
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3"><ShieldIcon className="text-brand" /> ضمان واسترجاع خلال 3 أيام</div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="related">
          <h2 id="related" className="mb-6 text-2xl font-extrabold">قد يعجبك أيضًا</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
