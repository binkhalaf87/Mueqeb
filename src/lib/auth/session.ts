import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, getSessionUserId } from "@/lib/db/server";
import { homePathForRole, type Role } from "@/lib/auth/routes";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession } from "@/lib/auth/token";

export type CurrentUser = {
  id: string;
  role: Role | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** حساب موقوف من الإدارة (مع السبب) */
  suspended: boolean;
  suspensionReason: string | null;
};

/** المستخدم الحالي مع ملفه، أو null. مُخزّن لكل طلب. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await getSessionUserId();
  if (!id) return null;

  const db = await getDb();
  const profile = await db.maybeOne<{
    role: Role | null;
    full_name: string;
    phone: string | null;
    email: string | null;
    suspended_at: string | null;
    suspension_reason: string | null;
  }>(
    `select p.role, p.full_name, p.phone, public.current_user_email() as email,
            p.suspended_at, p.suspension_reason
     from public.profiles p where p.id = $1`,
    [id],
  );
  // حساب حُذف بعد إصدار الجلسة
  if (!profile) return null;

  return {
    id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    suspended: Boolean(profile.suspended_at),
    suspensionReason: profile.suspension_reason,
  };
});

/** يضمن أن المستخدم مسجّل ودوره هو المطلوب، وإلا يعيد توجيهه لمساره */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.suspended) redirect("/suspended");
  if (user.role !== role) redirect(homePathForRole(user.role));
  return user;
}

/** يضمن أن المستخدم مسجّل (بأي دور أو بلا دور) */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.suspended) redirect("/suspended");
  return user;
}

/** يبدأ جلسة للمستخدم (بعد التسجيل أو الدخول) */
export async function startSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
