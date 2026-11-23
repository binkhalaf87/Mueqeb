import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import { formatHalalas } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { Card, PageTitle } from "@/components/ui";
import { ReconcileForm } from "./reconcile-form";

export const metadata: Metadata = { title: "مدفوعات معلّقة" };

export default async function PendingPaymentsPage() {
  await requireRole("admin");
  const db = await getDb();
  // محاولات دفع لم يصل إشعار بوابتها بعد (آخر 7 أيام)
  const rows = await db.query<{
    id: string;
    gateway: string;
    provider_ref: string;
    amount_halalas: number;
    created_at: string;
    request_id: string;
    request_status: string;
  }>(
    `select p.id, p.gateway, p.provider_ref, p.amount_halalas, p.created_at,
            o.request_id, r.status as request_status
     from public.payments p
     join public.orders o on o.id = p.order_id
     join public.service_requests r on r.id = o.request_id
     where p.status = 'initiated' and p.created_at > now() - interval '7 days'
     order by p.created_at desc`,
  );

  return (
    <div className="space-y-6">
      <PageTitle subtitle="محاولات دفع لم يصل إشعار بوابتها. إن خُصم المبلغ فعلاً، أدخل رقم المعاملة من لوحة البوابة: يتحقق النظام منها لدى البوابة ويطبّقها فقط إن طابق مرجعها ومبلغها.">
        مدفوعات معلّقة
      </PageTitle>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted" data-testid="no-pending-payments">
            لا توجد محاولات دفع معلّقة.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="pending-payments">
          {rows.map((p) => (
            <li key={p.id}>
              <Card className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <strong>{formatHalalas(p.amount_halalas)}</strong>
                  <span className="text-muted">{p.gateway}</span>
                  <span dir="ltr" className="font-mono text-xs">
                    {p.provider_ref}
                  </span>
                  <span className="text-muted">{formatDateTime(p.created_at)}</span>
                  <span className="text-muted">
                    الطلب <span dir="ltr">{p.request_id.slice(0, 8)}</span>
                  </span>
                </div>
                <ReconcileForm paymentId={p.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
