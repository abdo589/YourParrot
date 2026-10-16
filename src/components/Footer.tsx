import Link from "next/link";
import { categories } from "@/lib/products";
import { Logo } from "./icons";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-surface-2">
      <div className="container-x grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-lg font-extrabold">
            <Logo className="h-8 w-8" /> ببغاوتك
          </div>
          <p className="text-sm leading-7 text-muted">
            متجر متخصص في الببغاوات المُربّاة في الأسر ومستلزماتها، مع متابعة بيطرية ودعم بعد البيع.
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-bold">الأقسام</h2>
          <ul className="space-y-2 text-sm text-muted">
            {categories.map((c) => (
              <li key={c.id}>
                <Link className="hover:text-brand" href={`/shop?c=${c.id}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-bold">المساعدة</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-brand" href="/care">دليل الرعاية</Link></li>
            <li><Link className="hover:text-brand" href="/contact">تواصل معنا</Link></li>
            <li><Link className="hover:text-brand" href="/cart">سلة المشتريات</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-bold">التزامنا</h2>
          <ul className="space-y-2 text-sm leading-6 text-muted">
            <li>طيور مُربّاة في الأسر فقط — لا نتعامل في طيور مصطادة من البرية.</li>
            <li>الدفع عند الاستلام والمعاينة.</li>
            <li>بياناتك محمية ولا نشاركها مع أي طرف.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">
        © ببغاوتك YourParrot — جميع الحقوق محفوظة
      </div>
    </footer>
  );
}
