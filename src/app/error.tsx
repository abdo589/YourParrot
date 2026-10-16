"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-x py-24 text-center">
      <h1 className="text-2xl font-extrabold">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-muted">نعتذر عن ذلك. حاول مرة أخرى.</p>
      <button type="button" onClick={reset} className="btn-primary mt-8">إعادة المحاولة</button>
    </div>
  );
}
