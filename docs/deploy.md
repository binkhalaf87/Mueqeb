# دليل النشر للإنتاج

> **ملاحظة مهمة:** هذا الدليل يصف البنية الفعلية للمشروع: Railway للخادم وقاعدة البيانات، وVercel
> واجهة أمامية تمرّر كل الطلبات إليه، وGitHub مستودعاً. **Supabase لم يعد مستخدماً** بعد النقل إلى
> Postgres عادي (المرحلة 7)، والمشروع القديم موقوف ويمكن حذفه من لوحة Supabase.
>
> **الوضع الحي للدفع غير مفعّل.** القسم الأخير يشرح خطوات تفعيله لاحقاً فقط، والكود الحالي يرفض أي
> مفتاح Moyasar ليس `sk_test_`.

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
| `SEED_ON_START`                  | لا يُضبط                                    | للنسخ التجريبية فقط                                         |

لا تُخزَّن هذه القيم في المستودع. لا متغيرات Supabase إطلاقاً (`NEXT_PUBLIC_SUPABASE_*` وغيرها
يجب حذفها إن بقيت من نشر قديم).

## 5. البريد والإشعارات

- كل إشعار داخل المنصة يضيف صفاً في `notification_outbox`، والمُجدول يرسله كل دقيقة عبر
  `NotificationProvider` (حتى 5 محاولات).
- لتفعيل البريد: وثّق النطاق في Resend، واضبط `EMAIL_PROVIDER=resend` و`RESEND_API_KEY` و`EMAIL_FROM`.
- **واتساب**: القناة موجودة كمكان جاهز (`src/lib/notifications/whatsapp.ts`) ومعطّلة. تفعيلها لاحقاً
  يتطلب مزوّد WhatsApp Business API وقوالب رسائل معتمدة.

## 6. بوابة الدفع: الانتقال للوضع الحي (لا تُنفّذ الآن)

الكود الحالي **يرفض** المفاتيح الحية عمداً (`MoyasarGateway` يشترط `sk_test_`). خطوات التفعيل عند
اعتماد الحساب التجاري لدى Moyasar وبعد المراجعة القانونية للسياسات:

1. أكمل توثيق الحساب لدى Moyasar (السجل التجاري، الحساب البنكي)، واحصل على `sk_live_…`.
2. في webhook لوحة Moyasar: الرابط `https://<النطاق>/api/payments/webhook`، والسر = `MOYASAR_WEBHOOK_SECRET`
   (قيمة جديدة مختلفة عن بيئة الاختبار).
3. تعديل كود مراجَع (PR مستقل): السماح بـ `sk_live_` في `src/lib/payments/moyasar.ts` **فقط** عند
   متغير صريح (مثل `PAYMENTS_LIVE=1`) وفي بيئة الإنتاج، مع اختبار وحدة يثبت رفض الحي خارجها.
4. جرّب في بيئة staging منفصلة بمفاتيح الاختبار أولاً المسار الكامل (`npm run test:e2e`)، ثم دفعة حية
   صغيرة واسترداداً كاملاً، وتحقق من توازن الدفتر في `/admin/ledger`.
5. بعدها فقط: ضع `sk_live_…` في Railway وفعّل المتغير.

## 7. قاعدة البيانات

- الـ migrations تُطبّق تلقائياً عند كل بدء (جدول `migrations.applied`)، ولا تعديل يدوي على القاعدة.
- **النسخ الاحتياطي:** فعّل Backups في خدمة Postgres على Railway، وخذ نسخة يدوية قبل أي migration كبير:
  `pg_dump "$DATABASE_URL" -Fc > backup.dump`.
- **الملفات:** الـ Volume لا يُنسخ مع القاعدة؛ خذ له نسخة احتياطية دورية.
- أول مدير للمنصة: سجّل حساباً عادياً ثم رقّه من القاعدة بـ migration أو أمر SQL موثّق
  (`update public.profiles set role = 'admin' where id = …`) عبر اتصال الخادم.

## 8. قائمة تحقق قبل الإطلاق

- [ ] `npm run lint && npm run typecheck && npm run format:check && npm test && npm run build && npm run test:e2e` كلها خضراء.
- [ ] `/api/health` يعيد `{"ok":true}` عبر Vercel.
- [ ] `AUTH_SECRET` جديد وقوي، و`SEED_ON_START` و`RATE_LIMIT_MULTIPLIER` غير مضبوطين.
- [ ] `PAYMENT_PROVIDER=moyasar` بمفاتيح الاختبار، وwebhook مربوط ومُختبر.
- [ ] البريد يصل (أنشئ طلباً تجريبياً وتحقق من إشعار «عرض جديد»).
- [ ] صفحات الشروط والخصوصية والاسترداد **روجعت قانونياً** وأُزيل تنبيه المسودة.
- [ ] `/sitemap.xml` و`/robots.txt` يشيران للنطاق الصحيح (من `APP_URL`).
- [ ] النسخ الاحتياطي مفعّل للقاعدة والـ Volume.
