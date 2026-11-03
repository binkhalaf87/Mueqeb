# دليل النشر للإنتاج

> **ملاحظة مهمة:** هذا الدليل يصف البنية الفعلية للمشروع: Railway للخادم وقاعدة البيانات، وVercel
> واجهة أمامية تمرّر كل الطلبات إليه، وGitHub مستودعاً. **Supabase لم يعد مستخدماً** بعد النقل إلى
> Postgres عادي (المرحلة 7)، والمشروع القديم موقوف ويمكن حذفه من لوحة Supabase.
>
> **الوضع الحي للدفع مقفل افتراضياً.** الكود يدعمه، لكنه لا يعمل إلا بقرار صريح (`PAYMENTS_LIVE=1`)
> في الإنتاج وبمفتاح `sk_live_` — القسم 6.

## 1. البنية

```
المستخدم ──► Vercel (mueqeb.vercel.app أو النطاق المخصص)
              │  vercel.json: rewrite لكل المسارات، بلا build
              ▼
           Railway: خدمة web (Next.js، npm run start:railway)
              │  Volume مركّب على /data  ← STORAGE_DIR (المستندات الخاصة)
              │  المُجدول الداخلي (instrumentation.ts): المهام + إرسال البريد
              ▼
           Railway: خدمة Postgres (DATABASE_URL عبر الشبكة الخاصة)
```

- **GitHub** (`binkhalaf87/Mueqeb`): كل دفع للفرع المربوط يعيد نشر Railway تلقائياً.
- **Railway** يبني بـ Railpack (`railway.json`)، ثم عند البدء يطبّق الـ migrations
  (`npm run db:migrate`) قبل `next start`. فحص الصحة: `/api/health`.
- **Vercel** لا يبني شيئاً: `vercel.json` يمرّر كل الطلبات إلى نطاق Railway. إن تغيّر نطاق Railway
  فحدّث `destination` فيه.

## 2. إعداد Railway (مرة واحدة)

1. أنشئ مشروعاً، وأضف خدمة **Postgres** (قالب Railway الرسمي).
2. أضف خدمة من مستودع GitHub، واختر الفرع المعتمد للإنتاج.
3. أضف **Volume** للخدمة مركّباً على `/data`.
4. ولّد نطاقاً عاماً للخدمة (Settings → Networking)، وضعه في `vercel.json`.
5. اضبط المتغيرات (القسم 4)، ثم انشر. تحقق من `https://<النطاق>/api/health` → `{"ok":true}`.

> البيانات التجريبية (`SEED_ON_START=1`) **لا تُستخدم في الإنتاج**: احذف المتغير أو اجعله `0`.
> سكربت الـ seed يرفض قاعدة بعيدة إلا بـ `SEED_ALLOW_REMOTE=1`.

## 3. إعداد Vercel

1. اربط المشروع بالمستودع نفسه (Framework: Other). لا يحتاج أي متغيرات بيئة.
2. أضف النطاق المخصص (مثل `mueqeb.sa`) من Settings → Domains.
3. بعد إضافة النطاق حدّث في Railway: `APP_URL` و`SERVER_ACTIONS_ALLOWED_ORIGINS`.

## 4. متغيرات البيئة في Railway (خدمة web)

| المتغير                          | الإنتاج                                     | ملاحظات                                                     |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                   | `${{Postgres.DATABASE_URL}}`                | مرجع لمتغير خدمة Postgres (الشبكة الخاصة)                   |
| `DATABASE_POOL_MAX`              | اختياري (افتراضي 10)                        |                                                             |
| `AUTH_SECRET`                    | سلسلة عشوائية ≥ 32 حرفاً                    | `openssl rand -base64 48`. تغييره يُخرج كل المستخدمين       |
| `APP_URL`                        | `https://mueqeb.vercel.app` أو النطاق       | للروابط المطلقة، والـ sitemap، وروابط البريد، وعودة الدفع    |
| `SERVER_ACTIONS_ALLOWED_ORIGINS` | `mueqeb.vercel.app,<النطاق المخصص>`         | النطاقات التي يمرّ عبرها المستخدم (بلا https://)             |
| `STORAGE_DIR`                    | `/data/storage`                             | داخل الـ Volume                                             |
| `SCHEDULER`                      | لا تضبطه (مفعّل)                            | `off` يعطّل المهام وإرسال البريد                             |
| `PAYMENT_PROVIDER`               | `moyasar`                                   | `mock` مرفوض في الإنتاج إلا بـ `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=1` (نسخ العرض فقط) |
| `MOYASAR_SECRET_KEY`             | `sk_test_…` حالياً                          | راجع القسم 6                                                |
| `MOYASAR_WEBHOOK_SECRET`         | ≥ 16 حرفاً                                  | نفس القيمة في إعداد webhook لدى Moyasar                     |
| `EMAIL_PROVIDER`                 | `resend`                                    | `log` (الافتراضي) يكتب في السجل فقط                         |
| `RESEND_API_KEY`                 | من لوحة Resend                              |                                                             |
| `EMAIL_FROM`                     | `مُعقّب <no-reply@mueqeb.sa>`               | نطاق موثّق في Resend (SPF/DKIM)                             |
| `RATE_LIMIT_MULTIPLIER`          | **لا يُضبط أبداً في الإنتاج**               | للاختبارات الآلية فقط (يرفع حدود المعدل)                    |
| `EMAIL_LOG_FILE`                 | **لا يُضبط أبداً في الإنتاج**               | للاختبارات فقط: يكتب روابط البريد السرية في ملف            |
| `PAYMENTS_LIVE`                  | لا يُضبط حتى قرار الإطلاق                   | `1` = مبالغ حقيقية بمفتاح `sk_live_` (الإنتاج فقط) — القسم 6 |
| `ADMIN_BOOTSTRAP_EMAIL`          | مرة واحدة ثم يُحذف                          | ينشئ حساب الإدارة عند البدء — القسم 7                       |
| `ADMIN_BOOTSTRAP_PASSWORD`       | مرة واحدة ثم يُحذف                          | 12 حرفاً على الأقل                                          |
| `SEED_ON_START`                  | لا يُضبط                                    | للنسخ التجريبية فقط                                         |

لا تُخزَّن هذه القيم في المستودع. لا متغيرات Supabase إطلاقاً (`NEXT_PUBLIC_SUPABASE_*` وغيرها
يجب حذفها إن بقيت من نشر قديم).

## 5. البريد والإشعارات

- كل إشعار داخل المنصة يضيف صفاً في `notification_outbox`، والمُجدول يرسله كل دقيقة عبر
  `NotificationProvider` (حتى 5 محاولات).
- لتفعيل البريد: وثّق النطاق في Resend، واضبط `EMAIL_PROVIDER=resend` و`RESEND_API_KEY` و`EMAIL_FROM`.
- **واتساب**: القناة موجودة كمكان جاهز (`src/lib/notifications/whatsapp.ts`) ومعطّلة. تفعيلها لاحقاً
  يتطلب مزوّد WhatsApp Business API وقوالب رسائل معتمدة.

## 6. بوابة الدفع: الوضع الحي

الكود جاهز، والوضع الحي **مقفل افتراضياً**: لا يعمل إلا بثلاثة شروط معاً، وأي تعارض خطأ صريح يوقف
الدفع بدل التراجع بصمت:

- `PAYMENTS_LIVE=1`
- بيئة إنتاج (`RAILWAY_ENVIRONMENT_NAME=production`)
- مفتاح يبدأ بـ `sk_live_` (ومع `PAYMENTS_LIVE` غير مضبوط يُرفض أي مفتاح غير `sk_test_`)

خطوات التفعيل بعد اعتماد الحساب التجاري لدى Moyasar والمراجعة القانونية للسياسات:

1. في لوحة Moyasar (الوضع الحي): webhook إلى `https://<النطاق>/api/payments/webhook` بسر جديد طويل.
2. في Railway: `MOYASAR_SECRET_KEY=sk_live_…`، و`MOYASAR_WEBHOOK_SECRET=<السر الجديد>`، و`PAYMENTS_LIVE=1`.
3. **تجربة حقيقية قبل الإعلان:**
   - اطلب خدمة بأقل سعر من مكتب تجريبي، وادفع ببطاقة حقيقية.
   - تحقق أن الطلب صار «بانتظار التفويض» وأن الدفتر متوازن في `/admin/ledger`.
   - ألغِ الطلب قبل بدء التنفيذ، وتحقق من وصول الاسترداد للبطاقة ومن القيد العكسي.
4. للعودة لوضع الاختبار: احذف `PAYMENTS_LIVE` وأعد مفتاح `sk_test_`.

## 6.1 بوابة Paymob (الحساب المشترك مع JobAI)

المنصة تدعم Paymob السعودية بجانب Moyasar (`PAYMENT_PROVIDER=paymob`)، بنفس أسماء متغيرات JobAI:

| المتغير | القيمة |
| --- | --- |
| `PAYMENT_PROVIDER` | `paymob` |
| `PAYMOB_API_KEY` | المفتاح السري (`sau_sk_test_…` للاختبار، `sau_sk_live_…` للحي مع `PAYMENTS_LIVE=1`) |
| `PAYMOB_PUBLIC_KEY` | المفتاح العام المطابق لنفس الوضع |
| `PAYMOB_INTEGRATION_ID` | معرّف وسيلة الدفع، أو عدة معرّفات مفصولة بفواصل (بطاقات، Apple Pay…) |
| `PAYMOB_HMAC_SECRET` | سر HMAC من لوحة Paymob |

- كل طلب دفع يحمل رابط العودة ورابط الإشعار الخاصين بمُعقّب (`/api/payments/return` و`/api/payments/webhook`)،
  فلا يتعارض مع JobAI على الحساب نفسه.
- مراجع محاولات مُعقّب تبدأ بـ `mq_`؛ إشعارات المعاملات الأخرى على الحساب تُتجاهل. وإن كان رابط الإشعار العام في
  لوحة Paymob يشير لـ JobAI فستصله إشعارات مُعقّب أيضاً، ويجب أن يتجاهل المراجع التي لا يعرفها.
- لا استعلام مباشر عن الدفع: التأكيد يأتي من الـ webhook الموقّع فقط. تحقق من وصوله في أول تجربة.
- **قبل الوضع الحي:** جرّب بمفاتيح الاختبار دفعة ناجحة، ودفعة مرفوضة، وإلغاء طلب مدفوع (استرداد)، وتحقق من توازن الدفتر.

## 7. قاعدة البيانات

- الـ migrations تُطبّق تلقائياً عند كل بدء (جدول `migrations.applied`)، ولا تعديل يدوي على القاعدة.
- **النسخ الاحتياطي:** فعّل Backups في خدمة Postgres على Railway، وخذ نسخة يدوية قبل أي migration كبير:
  `pg_dump "$DATABASE_URL" -Fc > backup.dump`.
- **الملفات:** الـ Volume لا يُنسخ مع القاعدة؛ خذ له نسخة احتياطية دورية.
- **أول مدير للمنصة:** اضبط `ADMIN_BOOTSTRAP_EMAIL` و`ADMIN_BOOTSTRAP_PASSWORD` (و`ADMIN_BOOTSTRAP_NAME`
  اختيارياً) في Railway، وأعد النشر، فيُنشأ الحساب مؤكَّد البريد عند البدء. ثم **احذف المتغيرات**.
  لا يغيّر كلمة مرور حساب موجود أبداً؛ ترقية حساب موجود تتطلب `ADMIN_BOOTSTRAP_PROMOTE_EXISTING=1`.
  محلياً: `npm run admin:create`.
- **قاعدة نظيفة للإطلاق:** البيانات التجريبية (`SEED_ON_START`) لا تُحذف بإيقاف المتغير؛ أنشئ قاعدة
  Postgres جديدة في Railway واربط `DATABASE_URL` بها (الـ migrations تُطبّق عند البدء)، أو احذف الخدمة
  القديمة بعد أخذ نسخة. وامسح ملفات الـ Volume التجريبية.

## 8. قائمة تحقق قبل الإطلاق

- [ ] `npm run lint && npm run typecheck && npm run format:check && npm test && npm run build && npm run test:e2e` كلها خضراء.
- [ ] `/api/health` يعيد `{"ok":true}` عبر Vercel.
- [ ] `AUTH_SECRET` جديد وقوي، و`SEED_ON_START` و`RATE_LIMIT_MULTIPLIER` غير مضبوطين.
- [ ] `PAYMENT_PROVIDER=moyasar` بمفاتيح الاختبار، وwebhook مربوط ومُختبر.
- [ ] البريد يصل: سجّل حساباً جديداً وافتح رابط التأكيد، وجرّب «نسيت كلمة المرور».
- [ ] حساب الإدارة الحقيقي أُنشئ، وحُذفت متغيرات `ADMIN_BOOTSTRAP_*`.
- [ ] `PAYMENT_PROVIDER=moyasar` (ليس `mock`)، و`ALLOW_MOCK_PAYMENTS_IN_PRODUCTION` و`EMAIL_LOG_FILE` غير مضبوطين.
- [ ] صفحات الشروط والخصوصية والاسترداد **روجعت قانونياً** وأُزيل تنبيه المسودة.
- [ ] `/sitemap.xml` و`/robots.txt` يشيران للنطاق الصحيح (من `APP_URL`).
- [ ] النسخ الاحتياطي مفعّل للقاعدة والـ Volume.
