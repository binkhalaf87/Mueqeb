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

## النشر على Railway

المشروع جاهز للنشر على Railway (`railway.json`): يُبنى بـ `npm run build`، وتُطبَّق الـ migrations تلقائياً قبل
كل نشر (`npm run db:migrate`)، ويُفحص `/api/health`.

1. في مشروع Railway: **New → Database → PostgreSQL**.
2. **New → GitHub Repo** واختر هذا المستودع (الفرع المطلوب).
3. في خدمة التطبيق → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `AUTH_SECRET` = سلسلة عشوائية (`openssl rand -hex 32`)
   - `STORAGE_DIR` = `/data/storage`
   - `PAYMENT_PROVIDER` = `mock` و`MOCK_PAYMENT_WEBHOOK_SECRET` = سلسلة عشوائية
     (ولنسخة عرض على بيئة production: `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION` = `1`)
4. خدمة التطبيق → **Settings → Volumes**: أضف Volume على المسار `/data` (المستندات الخاصة).
5. **Settings → Networking → Generate Domain** للحصول على الرابط.
6. البيانات التجريبية (اختياري، مرة واحدة) من جهازك بعنوان القاعدة العام:
   `DATABASE_URL=<DATABASE_PUBLIC_URL> SEED_ALLOW_REMOTE=1 SEED_PASSWORD=<كلمة خاصة> npm run seed`
   (المستندات التجريبية تُكتب على جهازك لا على Volume الخادم، فروابطها لن تفتح؛ ارفع غيرها من الواجهة).

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
