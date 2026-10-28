import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "البلاغات" };

const ROLE = { requester: "العميل", provider: "المكتب", admin: "الإدارة" } as const;

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireRole("admin");
  const { tab } = await searchParams;
  const masked = tab === "masked";
  const supabase = await createClient();

  const [{ data: blocked, count: blockedCount }, { data: maskedMessages, count: maskedCount }] =
    await Promise.all([
      supabase
        .from("blocked_messages")
        .select("id, request_id, body, matched_term, created_at, profiles(full_name, role)", {
          count: "exact",
        })
        .order("id", { ascending: false })
        .limit(100),
      // المحادثة المحجوبة: الرسالة تُحفظ بعد الحجب، فيظهر النص المحجوب لا الرقم الأصلي
      supabase
        .from("messages")
        .select("id, request_id, sender_role, body, created_at, profiles(full_name)", {
          count: "exact",
        })
        .eq("was_masked", true)
        .order("id", { ascending: false })
        .limit(100),
    ]);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="محاولات طلب كلمات مرور أو رموز تحقق (مرفوضة)، ومحاولات مشاركة أرقام التواصل قبل الترسية (محجوبة).">
        البلاغات
      </PageTitle>

      <nav className="flex gap-2" aria-label="نوع البلاغ">
        {[
          {
            href: "/admin/reports",
            label: `طلب كلمة مرور / رمز تحقق (${blockedCount ?? 0})`,
            active: !masked,
          },
          {
            href: "/admin/reports?tab=masked",
            label: `مشاركة أرقام وروابط (${maskedCount ?? 0})`,
            active: masked,
          },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${t.active ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-primary"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <Card className="p-0">
        {!masked ? (
          !blocked?.length ? (
            <p className="p-6 text-sm text-muted">لا توجد بلاغات.</p>
          ) : (
            <ul className="divide-y divide-border text-sm" data-testid="blocked-messages">
              {blocked.map((b) => (
                <li key={b.id} className="space-y-1 px-6 py-3">
                  <p className="text-muted">
                    {formatDateTime(b.created_at)} · {b.profiles?.full_name} (
                    {ROLE[b.profiles?.role as keyof typeof ROLE] ?? "—"}) · الكلمة: «
                    {b.matched_term}» · طلب{" "}
                    <span className="font-mono" dir="ltr">
                      {b.request_id.slice(0, 8)}
                    </span>
                  </p>
                  <p>{b.body}</p>
                </li>
              ))}
            </ul>
          )
        ) : !maskedMessages?.length ? (
          <p className="p-6 text-sm text-muted">لا توجد محاولات.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="masked-messages">
            {maskedMessages.map((m) => (
              <li key={m.id} className="space-y-1 px-6 py-3">
                <p className="text-muted">
                  {formatDateTime(m.created_at)} · {m.profiles?.full_name} (
                  {ROLE[m.sender_role as keyof typeof ROLE]}) · طلب{" "}
                  <span className="font-mono" dir="ltr">
                    {m.request_id.slice(0, 8)}
                  </span>
                </p>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
