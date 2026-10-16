import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { ChatIcon, TruckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "تواصل معنا", description: "اسألنا عن أي طائر أو منتج، أو احجز استشارة مجانية." };

export default function ContactPage() {
  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-2">
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold">تواصل معنا</h1>
        <p className="max-w-md leading-8 text-muted">
          عندك سؤال عن نوع معيّن، أو محتاج تساعدك تختار أول ببغاء ليك؟ ابعتلنا رسالة وفريقنا هيرد عليك خلال يوم عمل.
        </p>
        <ul className="space-y-4">
          <li className="card flex items-center gap-4 p-5">
            <ChatIcon className="text-brand" />
            <div><div className="font-bold">مواعيد الرد</div><div className="text-sm text-muted">يوميًا من 10 صباحًا حتى 10 مساءً</div></div>
          </li>
          <li className="card flex items-center gap-4 p-5">
            <TruckIcon className="text-brand" />
            <div><div className="font-bold">التوصيل</div><div className="text-sm text-muted">من 2 إلى 5 أيام عمل حسب المحافظة</div></div>
          </li>
        </ul>
      </div>
      <ContactForm />
    </div>
  );
}
