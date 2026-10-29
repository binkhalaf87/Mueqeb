import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { formatHalalas } from "@/lib/money";
import { getPaymentProvider } from "@/lib/payments";
import { Card, PageTitle } from "@/components/ui";
import { PayButton } from "./pay-button";

export const metadata: Metadata = { title: "الدفع" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayPage({
  params,
}: PageProps<"/dashboard/requester/requests/[id]/pay">) {
  await requireRole("requester");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const db = await getDb();
  const order = await db.maybeOne<
    Tables<"orders"> & { request_status: string; service_name: string | null }
  >(
    `select o.*, r.status as request_status, t.name_ar as service_name
     from public.orders o
     join public.service_requests r on r.id = o.request_id
     left join public.service_types t on t.id = r.service_type_id
     where o.request_id = $1`,
    [id],
  );
  if (!order) notFound();
  if (order.payment_status !== "unpaid" || order.request_status !== "awarded_unpaid") {
    redirect(`/dashboard/requester/requests/${id}`);
  }

  const { data: offices } = await db.rpc("public_provider", { p_provider_id: order.provider_id });
  const office = offices?.[0];
  const pct = (bps: number) => `${bps / 100}%`;
  const gateway = getPaymentProvider().name;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href={`/dashboard/requester/requests/${id}`}
        className="text-sm text-primary hover:underline"
      >
        → الطلب
      </Link>
      <PageTitle subtitle={`${order.service_name} · ${office?.office_name ?? ""}`}>الدفع</PageTitle>

      <Card className="space-y-4" data-testid="payment-summary">
        <dl className="space-y-3">
          <div className="flex justify-between gap-4">
            <dt>أتعاب المزوّد</dt>
            <dd data-testid="fee">{formatHalalas(order.fee_halalas)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>
              رسم الخدمة <span className="text-sm text-muted">({pct(order.client_fee_bps)})</span>
            </dt>
            <dd data-testid="client-fee">+ {formatHalalas(order.client_fee_halalas)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-bold">
            <dt>الإجمالي المدفوع للمنصة</dt>
            <dd data-testid="total">{formatHalalas(order.total_paid_halalas)}</dd>
          </div>
        </dl>
        <p className="rounded-lg bg-background px-3 py-2 text-sm" data-testid="gov-fees">
          رسوم حكومية متوقعة تدفعها أنت مباشرة عبر القناة الرسمية:{" "}
          <strong>{formatHalalas(order.expected_gov_fees_halalas)}</strong>
          {order.expected_gov_fees_halalas === 0 && " (لم يحددها المكتب)"}
        </p>
        <p className="text-sm text-muted">
          يُحفظ المبلغ لدى المنصة ولا يُحوَّل للمكتب إلا بعد تأكيدك للإنجاز. يمكنك الإلغاء قبل بدء
          التنفيذ واسترداد المبلغ كاملاً.
        </p>
      </Card>

      <PayButton requestId={id} total={formatHalalas(order.total_paid_halalas)} />
      <p className="text-center text-xs text-muted">
        وضع الاختبار ({gateway === "mock" ? "بوابة اختبار محلية" : "Moyasar test"}) — لا تُخصم أي
        مبالغ حقيقية.
      </p>
    </div>
  );
}
