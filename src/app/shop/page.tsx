import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { SearchIcon } from "@/components/icons";
import { categories, isCategoryId, products } from "@/lib/products";

export const metadata: Metadata = {
  title: "المتجر",
  description: "تصفّح الببغاوات والأقفاص والأغذية والألعاب ومستلزمات العناية.",
};

const sorts = {
  featured: "الأكثر تميزًا",
  "price-asc": "السعر: من الأقل",
  "price-desc": "السعر: من الأعلى",
} as const;
type SortKey = keyof typeof sorts;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const rawCat = one(sp.c);
  const category = isCategoryId(rawCat) ? rawCat : null;
  const q = one(sp.q).trim().slice(0, 60);
  const rawSort = one(sp.sort);
  const sort: SortKey = rawSort in sorts ? (rawSort as SortKey) : "featured";

  const needle = q.toLowerCase();
  const list = products
    .filter((p) => !category || p.category === category)
    .filter((p) => !needle || `${p.name} ${p.short} ${p.description}`.toLowerCase().includes(needle))
    .sort((a, b) =>
      sort === "price-asc" ? a.price - b.price : sort === "price-desc" ? b.price - a.price : Number(!!b.featured) - Number(!!a.featured),
    );

  const href = (c: string | null) => {
    const params = new URLSearchParams();
    if (c) params.set("c", c);
    if (q) params.set("q", q);
    if (sort !== "featured") params.set("sort", sort);
    const s = params.toString();
    return s ? `/shop?${s}` : "/shop";
  };

  const title = category ? categories.find((c) => c.id === category)!.name : "كل المنتجات";

  return (
    <div className="container-x py-10">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="text-muted">{list.length} منتج</p>
      </header>

      <form action="/shop" method="get" className="card mb-6 flex flex-col gap-3 p-3 sm:flex-row" role="search">
        {category && <input type="hidden" name="c" value={category} />}
        <label className="relative flex-1">
          <span className="sr-only">ابحث في المنتجات</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} maxLength={60} placeholder="ابحث: كوكاتيل، قفص، فيتامين..." className="field pr-11" />
        </label>
        <label className="sm:w-56">
          <span className="sr-only">ترتيب</span>
          <select name="sort" defaultValue={sort} className="field">
            {Object.entries(sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="btn-primary">بحث</button>
      </form>

      <nav aria-label="الأقسام" className="mb-8 flex flex-wrap gap-2">
        {[{ id: null, name: "الكل" }, ...categories].map((c) => (
          <Link
            key={c.id ?? "all"}
            href={href(c.id)}
            aria-current={category === c.id ? "page" : undefined}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-brand aria-[current=page]:border-brand aria-[current=page]:bg-brand aria-[current=page]:text-on-brand"
          >
            {c.name}
          </Link>
        ))}
      </nav>

      {list.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <p className="text-lg font-bold">لا توجد نتائج مطابقة</p>
          <Link href="/shop" className="mt-4 inline-block text-brand hover:underline">عرض كل المنتجات</Link>
        </div>
      )}
    </div>
  );
}
