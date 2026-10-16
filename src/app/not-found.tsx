import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <p className="text-6xl font-extrabold text-brand">404</p>
      <h1 className="mt-4 text-2xl font-extrabold">الصفحة طارت!</h1>
      <p className="mt-2 text-muted">الصفحة التي تبحث عنها غير موجودة.</p>
      <Link href="/" className="btn-primary mt-8">العودة للرئيسية</Link>
    </div>
  );
}
