"use server";

import { redirect } from "next/navigation";
import { limits } from "@/server/limits";
import { clientIp } from "@/server/request";
import { adminEnabled, checkPassword, createSession, destroySession } from "@/server/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!adminEnabled()) return { error: "لوحة التحكم غير مفعّلة على هذا الخادم." };

  const rl = limits.login.check(`login:${await clientIp()}`);
  if (!rl.ok) return { error: `محاولات كثيرة. حاول بعد ${Math.ceil(rl.retryAfter / 60)} دقيقة.` };

  const password = form.get("password");
  if (typeof password !== "string" || password.length > 200 || !checkPassword(password)) {
    return { error: "كلمة المرور غير صحيحة." };
  }

  await createSession();
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}
