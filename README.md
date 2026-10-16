# ببغاوتك — YourParrot 🦜

متجر إلكتروني عربي (RTL) لبيع الببغاوات ومستلزماتها، مبني بـ **Next.js 16 + React 19 + TypeScript + Tailwind CSS 4**.

## المميزات

- **المتجر:** الرئيسية، المتجر مع بحث وفلترة بالأقسام وترتيب بالسعر (يعمل حتى بدون JavaScript)، صفحة لكل منتج، سلة مشتريات، إتمام طلب بالدفع عند الاستلام، دليل الرعاية، تواصل معنا.
- **لوحة تحكم** على `/admin` لعرض الطلبات والرسائل، محمية بكلمة مرور.
- تصميم متجاوب للموبايل، وضع ليلي تلقائي، رسومات SVG مرسومة بالكود (لا صور خارجية)، خط Cairo مستضاف محليًا.
- SEO: عناوين ووصف لكل صفحة، `sitemap.xml`، `robots.txt`، Web App Manifest.
- إمكانية الوصول: روابط تخطٍّ، تسميات للحقول، رسائل أخطاء مرتبطة بالحقول، احترام `prefers-reduced-motion`.

## الأمان

| الحماية | التفاصيل |
| --- | --- |
| Content-Security-Policy صارمة | `nonce` جديد لكل طلب مع `strict-dynamic` — يمنع XSS وحقن السكربتات (`src/proxy.ts`) |
| Security headers | HSTS، `X-Frame-Options: DENY`، `nosniff`، `Referrer-Policy`، `Permissions-Policy`، COOP/CORP، وإخفاء `X-Powered-By` (`next.config.ts`) |
| الأسعار من الخادم فقط | الخادم يعيد حساب الإجمالي من الكتالوج ويتحقق من المخزون؛ أي سعر قادم من المتصفح يُتجاهل (`src/lib/pricing.ts`) |
| التحقق من المدخلات | Zod على الخادم لكل حقل: أطوال قصوى، رقم موبايل مصري، قائمة محافظات مغلقة، إزالة رموز التحكم و bidi-override (`src/lib/validation.ts`) |
| Rate limiting | حد للطلبات والرسائل ومحاولات دخول الإدارة لكل IP (`src/server/limits.ts`) |
| Anti-spam | حقل honeypot مخفي في النماذج |
| CSRF | Server Actions تقبل POST فقط وتتحقق من `Origin`، والكوكي `SameSite=Strict` |
| جلسة الإدارة | كوكي `HttpOnly` + `Secure` موقّعة بـ HMAC-SHA256 وتنتهي بعد 8 ساعات، ومقارنة كلمة المرور بزمن ثابت (`src/server/session.ts`) |
| فصل كود الخادم | `server-only` يمنع تسريب كود/أسرار الخادم للمتصفح |
| تخزين | ملفات البيانات بصلاحيات `0600` والمجلد خارج git |

## التشغيل

```bash
npm install
cp .env.example .env.local   # واملأ ADMIN_PASSWORD و SESSION_SECRET
npm run dev                  # http://localhost:3000
```

| الأمر | الوظيفة |
| --- | --- |
| `npm run dev` | تشغيل بيئة التطوير |
| `npm run build && npm start` | بناء وتشغيل نسخة الإنتاج |
| `npm test` | اختبارات الوحدة (Vitest) |
| `npm run lint` / `npm run typecheck` | فحص الكود والأنواع |

## قبل الإطلاق الفعلي

- **قاعدة البيانات:** الطلبات تُحفظ حاليًا في ملفات JSON Lines داخل `DATA_DIR`. هذا مناسب لخادم واحد بقرص دائم (VPS)؛ على Vercel أو أي منصة serverless استبدل `src/server/store.ts` بقاعدة بيانات (Postgres / SQLite) — بنفس الدوال.
- **Rate limiting:** الحالي في الذاكرة لعملية واحدة؛ مع أكثر من instance استخدم Redis (مثل Upstash).
- **IP العميل:** يُقرأ من `X-Forwarded-For` — شغّل الموقع خلف reverse proxy (Nginx / Cloudflare / Vercel) يضبط هذا الهيدر.
- **المنتجات:** في `src/lib/products.ts` — عدّل الأسعار والمخزون والوصف من هناك.
- استبدل أرقام "عميل سعيد" وغيرها في الصفحة الرئيسية ببياناتك الحقيقية.

## هيكل المشروع

```
src/
  proxy.ts            CSP بـ nonce لكل طلب
  app/                الصفحات + Server Actions (actions/)
  components/         مكونات الواجهة والسلة
  lib/                الكتالوج، التسعير، التحقق، rate limiter (كود مشترك)
  server/             كود الخادم فقط: الجلسات، التخزين، الحدود
tests/                اختبارات Vitest
```
