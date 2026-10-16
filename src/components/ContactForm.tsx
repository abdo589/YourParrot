"use client";

import { useActionState, useState } from "react";
import { sendMessage, type ContactState } from "@/app/actions/contact";
import { FormField, Honeypot } from "./FormField";
import { CheckIcon } from "./icons";

const initial: ContactState = { status: "idle" };

export function ContactForm() {
  const [state, action, pending] = useActionState(sendMessage, initial);
  const [values, setValues] = useState({ name: "", phone: "", message: "" });
  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  if (state.status === "success") {
    return (
      <div className="card p-8 text-center" role="status">
        <CheckIcon width={40} height={40} className="mx-auto text-brand" />
        <p className="mt-3 text-lg font-bold">وصلتنا رسالتك، شكرًا لك!</p>
        <p className="mt-1 text-muted">سنتواصل معك في أقرب وقت.</p>
      </div>
    );
  }

  const err = state.status === "error" ? state.fields ?? {} : {};
  return (
    <form action={action} className="card relative space-y-5 p-6" noValidate>
      {state.status === "error" && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger">
          {state.message}
        </div>
      )}
      <FormField name="name" label="الاسم" error={err.name}>
        {(p) => <input {...p} className="field" autoComplete="name" maxLength={80} value={values.name} onChange={set} />}
      </FormField>
      <FormField name="phone" label="رقم الجوال" error={err.phone}>
        {(p) => <input {...p} className="field text-left" dir="ltr" type="tel" autoComplete="tel" maxLength={16} value={values.phone} onChange={set} />}
      </FormField>
      <FormField name="message" label="رسالتك" error={err.message}>
        {(p) => <textarea {...p} className="field min-h-36" maxLength={1500} value={values.message} onChange={set} />}
      </FormField>
      <Honeypot />
      <button className="btn-primary w-full py-3" disabled={pending}>{pending ? "جارٍ الإرسال..." : "إرسال"}</button>
    </form>
  );
}
