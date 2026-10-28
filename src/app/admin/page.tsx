import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, ROLES } from "@/lib/auth/routes";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "لوحة الإدارة" };

export default async function AdminDashboard() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: profiles }, { data: settings }, { count: queueCount }] = await Promise.all([
    supabase.from("profiles").select("role"),
    supabase.from("settings").select("key, value, description").order("key"),
    supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "pending")
      .not("submitted_at", "is", null),
  ]);

  const counts = new Map<string, number>();
  for (const p of profiles ?? []) {
    const key = p.role ?? "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageTitle>لوحة الإدارة</PageTitle>

      <Link href="/admin/providers" className="block">
        <Card className="flex items-center justify-between transition hover:border-primary">
          <span className="font-semibold">طلبات توثيق بانتظار المراجعة</span>
          <span className="text-2xl font-bold text-primary" data-testid="queue-count">
            {queueCount ?? 0}
          </span>
        </Card>
      </Link>

      <div className="grid gap-4 sm:grid-cols-4" data-testid="admin-user-counts">
        {[...ROLES, "none" as const].map((role) => (
          <Card key={role} className="p-4">
            <p className="text-sm text-muted">
              {role === "none" ? "لم يكمل التسجيل" : ROLE_LABEL[role]}
            </p>
            <p className="text-2xl font-bold">{counts.get(role) ?? 0}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">إعدادات المنصة</h2>
        <table className="w-full text-sm">
          <tbody>
            {(settings ?? []).map((s) => (
              <tr key={s.key} className="border-t border-border">
                <td className="py-2">{s.description ?? s.key}</td>
                <td className="py-2 font-mono text-muted" dir="ltr">
                  {s.key}
                </td>
                <td className="py-2 text-end font-semibold">{JSON.stringify(s.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
