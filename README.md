# مُعقّب

سوق إلكتروني يربط طالبي الخدمات الحكومية بمكاتب تعقيب مرخّصة. المواصفات في [`CLAUDE.md`](CLAUDE.md)،
والتقدم في [`docs/progress.md`](docs/progress.md).

## التشغيل محلياً

المتطلبات: Node.js 22 و Docker.

```bash
npm install
cp .env.local.example .env.local   # ثم املأ المفاتيح من `npx supabase status`
npm run db:start                   # Supabase محلي + تطبيق migrations
npm run seed                       # مستخدمون تجريبيون
npm run dev                        # http://localhost:3000
```

## الأوامر

| الأمر                                         | الوظيفة                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | تشغيل Next.js                                                                |
| `npm run lint` / `typecheck` / `format:check` | فحوص الجودة                                                                  |
| `npm test`                                    | Vitest: اختبارات الوحدات + اختبارات RLS (تحتاج Supabase محلياً، وإلا تُتخطى) |
| `npm run test:e2e`                            | Playwright (يحتاج Supabase محلياً + seed)                                    |
| `npm run db:reset`                            | إعادة بناء القاعدة من migrations (ثم `npm run seed`)                         |
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
