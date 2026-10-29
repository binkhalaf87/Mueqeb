import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ANON, asUser, dbFor, SERVICE } from "@/lib/db/core";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** معرّف المستخدم من كوكي الجلسة الموقّع (أو null). مُخزّن لكل طلب. */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
});

/** قاعدة البيانات بهوية المستخدم الحالي (أو زائر): RLS يحدد ما يُرى ويُعدَّل */
export async function getDb() {
  const userId = await getSessionUserId();
  return dbFor(userId ? asUser(userId) : ANON);
}

/**
 * بهوية الخادم (تتجاوز RLS) — للعمليات المالية والإدارية التي لا ينفّذها المستخدم مباشرة
 * (تسجيل محاولات الدفع، نتائج البوابة، الاسترداد، الصرف). لا يُستورد في مكوّنات العميل.
 */
export function serviceDb() {
  return dbFor(SERVICE);
}
