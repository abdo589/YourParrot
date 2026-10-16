"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/admin";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {} as LoginState);
  return (
    <form action={action} className="card space-y-4 p-6">
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">{state.error}</p>
      )}
      <div>
        <label htmlFor="password" className="label">كلمة المرور</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} className="field" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>{pending ? "جارٍ الدخول..." : "دخول"}</button>
    </form>
  );
}
