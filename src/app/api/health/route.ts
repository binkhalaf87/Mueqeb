import { serviceDb } from "@/lib/db/server";

/** فحص الصحة لـ Railway: الخادم يعمل وقاعدة البيانات متصلة والـ migrations مطبّقة */
export async function GET() {
  try {
    await serviceDb().one("select 1 as ok from public.settings limit 1");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
