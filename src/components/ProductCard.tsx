import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { getCategory, type Product } from "@/lib/products";
import { AddToCartButton } from "./AddToCartButton";
import { ProductArt } from "./ProductArt";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="card group flex flex-col overflow-hidden p-3 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5">
      <Link href={`/product/${product.slug}`} className="relative block overflow-hidden rounded-2xl">
        <ProductArt
          kind={product.art}
          palette={product.palette}
          label={product.name}
          className="aspect-square w-full transition duration-500 group-hover:scale-105"
        />
        {product.badge && (
          <span className="absolute top-3 right-3 rounded-full bg-mango px-3 py-1 text-xs font-bold text-black">
            {product.badge}
          </span>
        )}
        {product.stock <= 3 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-surface/90 px-3 py-1 text-xs font-bold text-coral">
            متبقي {product.stock} فقط
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 px-2 pt-4 pb-1">
        <span className="text-xs font-semibold text-brand">{getCategory(product.category)?.name}</span>
        <h3 className="font-bold leading-7">
          <Link href={`/product/${product.slug}`} className="hover:text-brand">{product.name}</Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted">{product.short}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <div className="text-lg font-extrabold">{formatPrice(product.price)}</div>
            {product.oldPrice && (
              <div className="text-xs text-muted line-through">{formatPrice(product.oldPrice)}</div>
            )}
          </div>
          <AddToCartButton slug={product.slug} name={product.name} compact />
        </div>
      </div>
    </article>
  );
}
