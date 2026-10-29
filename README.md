# مُعقّب

سوق إلكتروني يربط طالبي الخدمات الحكومية بمكاتب تعقيب مرخّصة. المواصفات في [`CLAUDE.md`](CLAUDE.md)،
والتقدم في [`docs/progress.md`](docs/progress.md).

## التشغيل محلياً

المتطلبات: Node.js 22 و Docker (لـ Postgres المحلي).

```bash
npm install
cp .env.local.example .env.local   # ثم ضع AUTH_SECRET عشوائياً: openssl rand -hex 32
npm run db:start                   # Postgres 17 في Docker على المنفذ 55432
npm run db:reset                   # إنشاء القاعدة وتطبيق migrations
npm run seed                       # مستخدمون وبيانات تجريبية
npm run dev                        # http://localhost:3000
```

## النشر: Railway (الخادم) + Vercel (الواجهة) + GitHub (المستودع)

```
المستخدم ──▶ mueqeb.vercel.app (Vercel: واجهة فقط، vercel.json يمرّر كل طلب)
                 └──▶ web-production-95b82.up.railway.app (Railway: خدمة web)
                          ├── Postgres (خدمة Railway)
                          └── Volume /data (المستندات الخاصة)
```

- **GitHub** `binkhalaf87/Mueqeb`: كل push على الفرع المربوط ينشر الطرفين تلقائياً.
- **Railway** (مشروع `mueqeb`): خدمة `web` تبني التطبيق (`railway.json`).
  - تطبّق الـ migrations قبل كل نشر.
  - تفحص `/api/health`.
  - تشغّل المهام المجدولة.
  - تستقبل webhooks الدفع.
- **Vercel** (مشروع `mueqeb`): لا يبني التطبيق ولا يحمل أي مفتاح أو اتصال بقاعدة البيانات.
  `vercel.json` يمرّر كل الطلبات إلى خدمة Railway، فتبقى الأسرار كلها في Railway.

متغيرات خدمة `web` في Railway:

| المتغير | الغرض |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (الشبكة الداخلية) |
| `AUTH_SECRET` | توقيع الجلسات وروابط الملفات |
| `STORAGE_DIR` | `/data/storage` على الـ Volume |
| `PORT` | `8080` (منفذ النطاق) |
| `APP_URL` | `https://mueqeb.vercel.app`: نطاق الواجهة لإعادة التوجيه وروابط العودة من البوابة |
| `SERVER_ACTIONS_ALLOWED_ORIGINS` | نطاقا Vercel وRailway المسموح لهما بالنماذج |
| `PAYMENT_PROVIDER` / `MOCK_PAYMENT_WEBHOOK_SECRET` / `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION` | بوابة الاختبار لنسخة العرض |
| `SEED_ON_START` / `SEED_ALLOW_REMOTE` / `SEED_PASSWORD` | تعبئة البيانات التجريبية عند التشغيل (idempotent) |

عند تغيير نطاق Railway حدّث `destination` في `vercel.json`، وعند تغيير نطاق Vercel حدّث `APP_URL`
و`SERVER_ACTIONS_ALLOWED_ORIGINS`.

## الدفع (وضع الاختبار فقط)

- `PAYMENT_PROVIDER=mock` (الافتراضي محلياً): بوابة اختبار محلية بصفحة دفع مستضافة وwebhook موقّع (HMAC).
  - بطاقة ناجحة: `4111 1111 1111 1111`
  - بطاقة مرفوضة: `4000 0000 0000 0002`
- `PAYMENT_PROVIDER=moyasar`: يتطلب `MOYASAR_SECRET_KEY=sk_test_…` و`MOYASAR_WEBHOOK_SECRET`، ويرفض المفاتيح الحية.
  - عنوان الـ webhook: `/api/payments/webhook`.
  - بطاقات Moyasar التجريبية من توثيقها.

## الأوامر

| الأمر                                         | الوظيفة                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | تشغيل Next.js                                                                |
| `npm run lint` / `typecheck` / `format:check` | فحوص الجودة                                                                  |
| `npm test`                                    | Vitest: اختبارات الوحدات + اختبارات RLS (تحتاج Postgres محلياً، وإلا تُتخطى) |
| `npm run test:e2e`                            | Playwright (يحتاج Postgres محلياً + seed)                                    |
| `npm run db:start` / `db:stop`                | تشغيل/إيقاف Postgres المحلي في Docker                                        |
| `npm run db:migrate`                          | تطبيق migrations الجديدة فقط (يعمل تلقائياً على Railway)                      |
| `npm run db:reset`                            | إعادة بناء القاعدة المحلية من migrations (ثم `npm run seed`)                 |
| `npm run db:types`                            | توليد أنواع TypeScript من القاعدة                                            |

## حسابات seed

كلمة المرور لكل الحسابات: `Mueqeb#2026`

| الدور             | الدخول                      |
| ----------------- | --------------------------- |
| مدير              | `admin@mueqeb.test`         |
| مزوّد 1 (معتمد، 5 خدمات) | `provider1@mueqeb.test`     |
| مزوّد 2 (قيد المراجعة) | `0500000002`                |
| مزوّد 3 (معتمد، الرياض) | `provider3@mueqeb.test` |
| مزوّد 4 (معتمد، الرياض وحائل) | `provider4@mueqeb.test` |
| طالب خدمة (فرد)   | `0500000003`                |
| طالب خدمة (منشأة) | `establishment@mueqeb.test` |

يُنشئ seed أيضاً طلباً عاماً مفتوحاً من المنشأة (رخص عمل، الرياض) عليه عرض من المزوّد 1.
