import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole, type Role } from "@/lib/auth/routes";

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
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // حساب أوقفته الإدارة: Auth يرفض getUser، لكن الجلسة القائمة ما زالت صالحة التوقيع.
  // نأخذ الهوية من الـ claims الموثّقة ونعامله كموقوف، فيُوجَّه لصفحة الإيقاف بدل حلقة إعادة توجيه.
  let id = user?.id;
  const banned = !user && error?.code === "user_banned";
  if (banned) {
    const { data } = await supabase.auth.getClaims();
    id = data?.claims?.sub;
  }
  if (!id) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, phone, suspended_at, suspension_reason")
    .eq("id", id)
    .single();

  return {
    id,
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? "",
    email: user?.email ?? null,
    phone: profile?.phone ?? user?.phone ?? null,
    suspended: banned || Boolean(profile?.suspended_at),
    suspensionReason: profile?.suspension_reason ?? null,
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
