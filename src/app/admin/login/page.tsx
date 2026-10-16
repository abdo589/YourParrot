import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockIcon } from "@/components/icons";
import { adminEnabled, isAdmin } from "@/server/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "دخول الإدارة", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="container-x max-w-sm py-16">
      <div className="mb-6 text-center">
        <LockIcon width={36} height={36} className="mx-auto text-brand" />
        <h1 className="mt-3 text-2xl font-extrabold">دخول الإدارة</h1>
      </div>
      {adminEnabled() ? (
        <LoginForm />
      ) : (
        <p className="card p-6 text-center text-sm leading-7 text-muted">
          لوحة التحكم غير مفعّلة. اضبط المتغيرين <code dir="ltr">ADMIN_PASSWORD</code> و<code dir="ltr">SESSION_SECRET</code> على الخادم.
        </p>
      )}
    </div>
  );
}
