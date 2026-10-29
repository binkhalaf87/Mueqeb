/**
 * تسجيل الأخطاء دون بيانات حساسة: الاسم والرمز والرسالة المختصرة فقط.
 * أخطاء Postgres تحمل في detail قيماً فعلية (بريد، جوال، مبالغ)، وأخطاء البوابات قد تحمل
 * استجابات كاملة؛ فلا تُطبع كما هي. أثر الاستدعاء (stack) خارج الإنتاج فقط.
 */
export function logError(context: string, error: unknown) {
  const e = error as { name?: string; code?: string; message?: string; stack?: string };
  const summary = {
    name: e?.name ?? typeof error,
    code: e?.code,
    message: String(e?.message ?? error)
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
      .replace(/\+?\d{9,}/g, "[number]")
      .slice(0, 300),
  };
  console.error(`[${context}]`, JSON.stringify(summary));
  // إطارات الأثر فقط: السطر الأول يكرر الرسالة غير المنقّحة
  if (process.env.NODE_ENV !== "production" && e?.stack) {
    console.error(
      e.stack
        .split("\n")
        .filter((line) => line.trimStart().startsWith("at "))
        .join("\n"),
    );
  }
}
