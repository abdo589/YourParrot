import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { headers } from "next/headers";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "ببغاوتك | متجر الببغاوات ومستلزماتها", template: "%s | ببغاوتك" },
  description:
    "متجر ببغاوتك: ببغاوات مُربّاة في الأسر بشهادات صحية، وأقفاص وأغذية وألعاب ومستلزمات عناية، مع الدفع عند الاستلام والتوصيل لكل محافظات مصر.",
  applicationName: "YourParrot",
  openGraph: { type: "website", locale: "ar_EG", siteName: "ببغاوتك" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1612" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers makes every page render per-request, which is
  // required for the nonce-based CSP set in proxy.ts.
  await headers();

  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 btn-primary">
          تخطَّ إلى المحتوى
        </a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
