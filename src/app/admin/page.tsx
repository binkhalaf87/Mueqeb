import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminKpis } from "@/lib/admin/kpis";
import { formatHalalas } from "@/lib/money";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "لوحة الإدارة" };

function Kpi({
  label,
  value,
  hint,
  testId,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full p-4 transition hover:border-primary">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function AdminDashboard() {
  await requireRole("admin");
  const supabase = await createClient();
  const [k, { count: queueCount }] = await Promise.all([
    getAdminKpis(),
    supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "pending")
      .not("submitted_at", "is", null),
  ]);
  const commission = k.revenue_halalas - k.revenue_client_fee_halalas;

  return (
    <div className="space-y-6">
      <PageTitle subtitle="الأرقام المالية محسوبة من قيود دفتر الحسابات مباشرة.">
        لوحة المؤشرات
      </PageTitle>

      <section className="space-y-2">
        <h2 className="font-semibold">الطلبات</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Kpi label="طلبات منشورة" value={String(k.requests_published)} testId="kpi-published" />
          <Kpi label="طلبات مكتملة" value={String(k.requests_completed)} testId="kpi-completed" />
          <Kpi
            label="طلبات متنازع عليها"
            value={String(k.requests_disputed)}
            hint={`مفتوحة الآن: ${k.disputes_open}`}
            testId="kpi-disputed"
            href="/admin/disputes"
          />
          <Kpi
            label="تكرار الطلب للمنشآت (60 يوماً)"
            value={k.repeat_rate_pct == null ? "—" : `${k.repeat_rate_pct}%`}
            hint={`${k.repeat_establishments} من ${k.active_establishments} منشأة نشرت طلبين أو أكثر`}
            testId="kpi-repeat"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">المال</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Kpi
            label="الإيراد (عمولة + رسوم خدمة)"
            value={formatHalalas(k.revenue_halalas)}
            hint={`عمولة ${formatHalalas(commission)} · رسوم خدمة ${formatHalalas(k.revenue_client_fee_halalas)}`}
            testId="kpi-revenue"
            href="/admin/ledger"
          />
          <Kpi
            label="محفوظ في الضمان"
            value={formatHalalas(k.escrow_halalas)}
            testId="kpi-escrow"
            href="/admin/ledger"
          />
          <Kpi
            label="مستحقات غير مصروفة"
            value={formatHalalas(k.payables_halalas)}
            testId="kpi-payables"
            href="/admin/payables"
          />
          <Kpi
            label="مصروف للمزوّدين"
            value={formatHalalas(k.paid_out_halalas)}
            testId="kpi-paid-out"
            href="/admin/payables"
          />
        </div>
      </section>

      <Link href="/admin/providers" className="block">
        <Card className="flex items-center justify-between transition hover:border-primary">
          <span className="font-semibold">طلبات توثيق بانتظار المراجعة</span>
          <span className="text-2xl font-bold text-primary" data-testid="queue-count">
            {queueCount ?? 0}
          </span>
        </Card>
      </Link>
    </div>
  );
}
