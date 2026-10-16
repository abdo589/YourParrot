import Link from "next/link";
import { ProductArt } from "@/components/ProductArt";
import { ProductCard } from "@/components/ProductCard";
import { ChatIcon, HeartIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/pricing";
import { formatPrice } from "@/lib/format";
import { categories, products } from "@/lib/products";

const perks = [
  { icon: ShieldIcon, title: "شهادة صحية لكل طائر", text: "فحص بيطري كامل وحلقة تعريف قبل التسليم." },
  { icon: TruckIcon, title: "توصيل آمن", text: `لكل المحافظات، ومجاني للطلبات فوق ${formatPrice(FREE_SHIPPING_THRESHOLD)}.` },
  { icon: HeartIcon, title: "مُربّاة يدويًا", text: "طيور أليفة معتادة على الناس من مزارع موثوقة." },
  { icon: ChatIcon, title: "دعم بعد البيع", text: "متابعة مجانية لمدة شهر ونصائح تغذية ورعاية." },
];

export default function Home() {
  const featured = products.filter((p) => p.featured);
  const hero = products.find((p) => p.slug === "blue-gold-macaw")!;
  const hero2 = products.find((p) => p.slug === "sun-conure")!;

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="container-x grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-4 py-1.5 text-sm font-bold text-brand">
              <ShieldIcon width={16} height={16} /> طيور مُربّاة في الأسر بشهادات صحية
            </span>
            <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl">
              رفيقك الملوّن
              <br />
              <span className="text-brand">يبدأ من هنا.</span>
            </h1>
            <p className="max-w-lg text-lg leading-8 text-muted">
              ببغاوات أليفة، وأقفاص آمنة، وأغذية متوازنة، وكل ما يحتاجه طائرك ليعيش حياة سعيدة — مع الدفع عند الاستلام.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/shop?c=birds" className="btn-primary px-7 py-3 text-base">تصفّح الببغاوات</Link>
              <Link href="/shop" className="btn-ghost px-7 py-3 text-base">كل المنتجات</Link>
            </div>
            <dl className="flex gap-8 pt-2">
              <div><dt className="text-xs text-muted">نوع من الطيور</dt><dd className="text-2xl font-extrabold">+6</dd></div>
              <div><dt className="text-xs text-muted">عميل سعيد</dt><dd className="text-2xl font-extrabold">+1,200</dd></div>
              <div><dt className="text-xs text-muted">محافظة نوصّل لها</dt><dd className="text-2xl font-extrabold">27</dd></div>
            </dl>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-mango/30 via-brand/15 to-coral/20 blur-2xl" />
            <ProductArt kind={hero.art} palette={hero.palette} label={hero.name} className="animate-float w-full drop-shadow-2xl" />
            <ProductArt
              kind={hero2.art}
              palette={hero2.palette}
              label={hero2.name}
              className="absolute -bottom-6 -left-4 w-36 rounded-[28px] border-4 border-bg shadow-xl sm:w-44"
            />
          </div>
        </div>
      </section>

      <section className="container-x py-10" aria-labelledby="cats">
        <h2 id="cats" className="mb-6 text-2xl font-extrabold">تسوّق حسب القسم</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/shop?c=${c.id}`} className="card block h-full p-5 transition hover:border-brand">
                <div className="font-bold">{c.name}</div>
                <div className="mt-1 text-sm text-muted">{c.blurb}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-x py-10" aria-labelledby="featured">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="featured" className="text-2xl font-extrabold">منتجات مختارة</h2>
          <Link href="/shop" className="text-sm font-bold text-brand hover:underline">عرض الكل ←</Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </section>

      <section className="container-x py-10" aria-labelledby="why">
        <h2 id="why" className="sr-only">لماذا ببغاوتك</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map(({ icon: Icon, title, text }) => (
            <li key={title} className="card p-6">
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Icon />
              </span>
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-x py-10">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand px-8 py-12 text-on-brand sm:px-12">
          <div className="absolute -top-16 -left-16 h-56 w-56 rounded-full bg-mango/30" />
          <div className="relative max-w-xl space-y-4">
            <h2 className="text-3xl font-extrabold">أول ببغاء ليك؟</h2>
            <p className="leading-8 opacity-90">
              اقرأ دليل الرعاية المختصر، أو كلّمنا ونساعدك تختار النوع المناسب لمساحة بيتك ووقتك.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/care" className="btn bg-white px-6 py-3 text-black hover:bg-white/90">دليل الرعاية</Link>
              <Link href="/contact" className="btn border border-white/50 px-6 py-3 hover:bg-white/10">استشارة مجانية</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
