import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "دليل الرعاية",
  description: "أساسيات رعاية الببغاوات: التغذية، القفص، النظافة، والتفاعل اليومي.",
};

const sections = [
  {
    title: "التغذية",
    points: [
      "اجعل الحبيبات المتكاملة 60–70% من الغذاء، والباقي خضروات وفواكه طازجة وبذور.",
      "ممنوع تمامًا: الأفوكادو، الشوكولاتة، القهوة، الملح، البصل والثوم.",
      "غيّر الماء يوميًا واغسل الأوعية بالماء الساخن.",
    ],
  },
  {
    title: "القفص والمكان",
    points: [
      "اختر قفصًا يسمح للطائر بفرد جناحيه بالكامل، والأكبر دائمًا أفضل.",
      "ضع القفص بعيدًا عن المطبخ وأبخرة أواني التيفال والتيارات الهوائية المباشرة.",
      "استخدم مجاثم خشبية طبيعية بأقطار مختلفة لصحة القدمين.",
    ],
  },
  {
    title: "النظافة والصحة",
    points: [
      "نظّف صينية القفص يوميًا، وطهّر القفص بالكامل أسبوعيًا.",
      "وفّر حمّامًا أو رذاذ ماء خفيف مرتين أسبوعيًا.",
      "علامات تستدعي الطبيب: انتفاش مستمر، خمول، تغيّر في الإخراج، أو فقدان الشهية.",
    ],
  },
  {
    title: "التفاعل والتدريب",
    points: [
      "الببغاوات كائنات اجتماعية وتحتاج ساعة تفاعل يوميًا على الأقل.",
      "بدّل الألعاب أسبوعيًا لتمنع الملل ونتف الريش.",
      "درّب الطائر بجلسات قصيرة (10 دقائق) ومكافآت صغيرة.",
    ],
  },
];

export default function CarePage() {
  return (
    <div className="container-x max-w-4xl py-10">
      <h1 className="text-3xl font-extrabold">دليل رعاية الببغاوات</h1>
      <p className="mt-3 max-w-2xl leading-8 text-muted">
        نصائح مختصرة من فريقنا البيطري لتبدأ بداية صحيحة. لكل نوع احتياجات خاصة — تواصل معنا لو عندك سؤال محدد.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {sections.map((s, i) => (
          <section key={s.title} className="card p-6">
            <span className="text-sm font-bold text-mango">0{i + 1}</span>
            <h2 className="mt-1 text-xl font-extrabold">{s.title}</h2>
            <ul className="mt-4 list-disc space-y-2 pr-5 text-sm leading-7 marker:text-brand">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/shop?c=food" className="btn-primary">تسوّق الأغذية</Link>
        <Link href="/contact" className="btn-ghost">اسأل فريقنا</Link>
      </div>
    </div>
  );
}
