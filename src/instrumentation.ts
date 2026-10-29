/** يُستدعى مرة عند تشغيل خادم Next.js: يبدأ مُجدول المهام (إلا إذا عُطّل بـ SCHEDULER=off) */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SCHEDULER === "off") return;
  if (!process.env.DATABASE_URL) return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
