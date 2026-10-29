import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import { formatDateTime } from "@/lib/format";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "البلاغات" };

const ROLE = { requester: "العميل", provider: "المكتب", admin: "الإدارة" } as const;

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireRole("admin");
  const { tab } = await searchParams;
  const masked = tab === "masked";
  const db = await getDb();

  type Row = {
    id: number;
    request_id: string;
    body: string;
    created_at: string;
    full_name: string | null;
    total: number;
  };
  const [blocked, maskedMessages] = await Promise.all([
    db.query<Row & { matched_term: string; role: string | null }>(
      `select b.id, b.request_id, b.body, b.matched_term, b.created_at, p.full_name, p.role,
              count(*) over () as total
       from public.blocked_messages b left join public.profiles p on p.id = b.sender_id
       order by b.id desc limit 100`,
    ),
    // المحادثة المحجوبة: الرسالة تُحفظ بعد الحجب، فيظهر النص المحجوب لا الرقم الأصلي
    db.query<Row & { sender_role: string }>(
      `select m.id, m.request_id, m.sender_role, m.body, m.created_at, p.full_name,
              count(*) over () as total
       from public.messages m left join public.profiles p on p.id = m.sender_id
       where m.was_masked
       order by m.id desc limit 100`,
    ),
  ]);
  const blockedCount = blocked[0]?.total ?? 0;
  const maskedCount = maskedMessages[0]?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageTitle subtitle="محاولات طلب كلمات مرور أو رموز تحقق (مرفوضة)، ومحاولات مشاركة أرقام التواصل قبل الترسية (محجوبة).">
        البلاغات
      </PageTitle>

      <nav className="flex gap-2" aria-label="نوع البلاغ">
        {[
          {
            href: "/admin/reports",
            label: `طلب كلمة مرور / رمز تحقق (${blockedCount})`,
            active: !masked,
          },
          {
            href: "/admin/reports?tab=masked",
            label: `مشاركة أرقام وروابط (${maskedCount})`,
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
          !blocked.length ? (
            <p className="p-6 text-sm text-muted">لا توجد بلاغات.</p>
          ) : (
            <ul className="divide-y divide-border text-sm" data-testid="blocked-messages">
              {blocked.map((b) => (
                <li key={b.id} className="space-y-1 px-6 py-3">
                  <p className="text-muted">
                    {formatDateTime(b.created_at)} · {b.full_name} (
                    {ROLE[b.role as keyof typeof ROLE] ?? "—"}) · الكلمة: «{b.matched_term}» · طلب{" "}
                    <span className="font-mono" dir="ltr">
                      {b.request_id.slice(0, 8)}
                    </span>
                  </p>
                  <p>{b.body}</p>
                </li>
              ))}
            </ul>
          )
        ) : !maskedMessages.length ? (
          <p className="p-6 text-sm text-muted">لا توجد محاولات.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="masked-messages">
            {maskedMessages.map((m) => (
              <li key={m.id} className="space-y-1 px-6 py-3">
                <p className="text-muted">
                  {formatDateTime(m.created_at)} · {m.full_name} (
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
