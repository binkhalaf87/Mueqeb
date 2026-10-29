import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ANON, asUser, dbFor, SERVICE } from "@/lib/db/core";
import { readSession, SESSION_COOKIE } from "@/lib/auth/token";
import { sessionVersion } from "@/lib/auth/accounts";

/**
 * معرّف المستخدم من كوكي الجلسة الموقّع (أو null). مُخزّن لكل طلب.
 * تُرفض الجلسة إن حُذف الحساب أو تغيّرت كلمة المرور بعد إصدارها (إصدار الجلسات تغيّر).
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const session = await readSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const current = await sessionVersion(session.userId);
  if (current === null || current !== session.version) return null;
  return session.userId;
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
