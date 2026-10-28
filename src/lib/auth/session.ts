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
};

/** المستخدم الحالي مع ملفه، أو null. مُخزّن لكل طلب. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, phone")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? "",
    email: user.email ?? null,
    phone: profile?.phone ?? user.phone ?? null,
  };
});

/** يضمن أن المستخدم مسجّل ودوره هو المطلوب، وإلا يعيد توجيهه لمساره */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homePathForRole(user.role));
  return user;
}

/** يضمن أن المستخدم مسجّل (بأي دور أو بلا دور) */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
