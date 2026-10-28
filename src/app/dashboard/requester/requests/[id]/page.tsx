import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatHalalas } from "@/lib/money";
import { formatDateTime, formatDuration, timeLeft } from "@/lib/format";
import {
  BID_STATUS_LABEL,
  MODE_LABEL,
  STATUS_LABEL,
  URGENCY_LABEL,
} from "@/lib/requests/constants";
import { acceptBid, cancelRequest } from "@/app/actions/requests";
import { ActionButton } from "@/components/action-button";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Badge, Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "تفاصيل الطلب" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequesterRequestPage({
  params,
}: PageProps<"/dashboard/requester/requests/[id]">) {
  await requireRole("requester");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("service_requests")
    .select(
      "*, service_types(name_ar, guide_min_halalas, guide_max_halalas), request_private_details(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  const [{ data: bids }, { data: order }, { data: events }] = await Promise.all([
    supabase.rpc("request_bids", { p_request_id: id }),
    supabase
      .from("orders")
      .select(
        "id, total_paid_halalas, payment_status, paid_at, refunded_at, payments(status, failure_reason, created_at)",
      )
      .eq("request_id", id)
      .maybeSingle(),
    supabase
      .from("order_events")
      .select("id, from_status, to_status, actor_role, note, created_at")
      .eq("request_id", id)
      .order("created_at"),
  ]);

  const open = request.status === "open";
  const remaining = timeLeft(request.bids_deadline);
  const activeBids = (bids ?? []).filter((b) => b.status === "submitted");
  const lowestFee = Math.min(...activeBids.map((b) => b.fee_halalas));
  const fastest = Math.min(...activeBids.map((b) => b.duration_days));
  const awarded = (bids ?? []).find((b) => b.id === request.awarded_bid_id);
  const details = request.request_private_details;
  // الإلغاء متاح قبل بدء التنفيذ؛ بعد الدفع يكون مع استرداد كامل
  const cancellable = ["open", "awarded_unpaid", "paid", "awaiting_client"].includes(
    request.status,
  );
  const paid = order?.payment_status === "paid";
  const lastAttempt = [...(order?.payments ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/requester" className="text-sm text-primary hover:underline">
        → طلباتي
      </Link>
      <PageTitle subtitle={`${MODE_LABEL[request.mode]} · ${request.city}`}>
        <span className="flex flex-wrap items-center gap-3">
          {request.service_types?.name_ar} <RequestStatusBadge status={request.status} />
        </span>
      </PageTitle>

      {awarded && (
        <Card className="border-primary" data-testid="awarded-bid">
          <h2 className="font-semibold">العرض المختار</h2>
          <p className="mt-1">
            {awarded.office_name} — {formatHalalas(awarded.fee_halalas)} · {awarded.duration_days}{" "}
            يوم
          </p>
          {request.status === "awarded_unpaid" && order && (
            <div className="mt-3 space-y-2">
              {lastAttempt?.status === "failed" && (
                <p className="text-sm text-danger" data-testid="payment-failed">
                  لم تنجح محاولة الدفع الأخيرة
                  {lastAttempt.failure_reason ? `: ${lastAttempt.failure_reason}` : ""}. حاول
                  مجدداً.
                </p>
              )}
              <Link
                href={`/dashboard/requester/requests/${request.id}/pay`}
                className="inline-block rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
              >
                ادفع الآن — {formatHalalas(order.total_paid_halalas)}
              </Link>
            </div>
          )}
        </Card>
      )}

      {order && order.payment_status !== "unpaid" && (
        <Card data-testid="payment-status">
          {paid ? (
            <p>
              ✓ دفعت <strong>{formatHalalas(order.total_paid_halalas)}</strong>
              {order.paid_at && ` في ${formatDateTime(order.paid_at)}`}. المبلغ محفوظ لدى المنصة ولا
              يُحوَّل للمكتب إلا بعد تأكيدك للإنجاز.
            </p>
          ) : (
            <p>
              أُعيد إليك المبلغ كاملاً ({formatHalalas(order.total_paid_halalas)})
              {order.refunded_at && ` في ${formatDateTime(order.refunded_at)}`}.
            </p>
          )}
          {request.status === "awaiting_client" && (
            <p className="mt-2 text-sm text-muted">
              الخطوة التالية: تفويض المكتب عبر المنصة الرسمية وتجهيز المستندات (المرحلة القادمة).
            </p>
          )}
        </Card>
      )}

      {request.mode !== "direct_listed" && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
            <h2 className="font-semibold">العروض ({bids?.length ?? 0})</h2>
            {open && (
              <span className="text-sm text-muted">
                {remaining ? `تُستقبل العروض لمدة ${remaining}` : "انتهت مهلة العروض — اختر عرضاً"}
              </span>
            )}
          </div>
          {!bids?.length ? (
            <p className="p-6 text-sm text-muted">لم تصل عروض بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm" data-testid="bids-table">
                <thead className="bg-background text-muted">
                  <tr className="text-start">
                    <th className="px-4 py-2 text-start font-medium">المكتب</th>
                    <th className="px-4 py-2 text-start font-medium">الأتعاب</th>
                    <th className="px-4 py-2 text-start font-medium">المدة</th>
                    <th className="px-4 py-2 text-start font-medium">التقييم</th>
                    <th className="px-4 py-2 text-start font-medium">الإنجازات</th>
                    <th className="px-4 py-2 text-start font-medium">وقت الرد</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bids.map((b) => (
                    <tr key={b.id} className="align-top" data-testid="bid-row">
                      <td className="px-4 py-3">
                        <Link
                          href={`/providers/${b.provider_id}`}
                          className="font-medium hover:text-primary"
                        >
                          {b.office_name}
                        </Link>
                        <p className="mt-1 text-xs text-muted">يشمل: {b.includes}</p>
                        {b.needs_from_client && (
                          <p className="text-xs text-muted">يحتاج منك: {b.needs_from_client}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <strong>{formatHalalas(b.fee_halalas)}</strong>
                        {open && b.fee_halalas === lowestFee && activeBids.length > 1 && (
                          <Badge tone="success" className="ms-1">
                            الأقل
                          </Badge>
                        )}
                        {b.expected_gov_fees_halalas > 0 && (
                          <p className="text-xs text-muted">
                            + رسوم حكومية متوقعة {formatHalalas(b.expected_gov_fees_halalas)}{" "}
                            (تدفعها مباشرة)
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.duration_days} يوم
                        {open && b.duration_days === fastest && activeBids.length > 1 && (
                          <Badge tone="info" className="ms-1">
                            الأسرع
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{b.rating ?? "—"}</td>
                      <td className="px-4 py-3">{b.completed_orders}</td>
                      <td className="px-4 py-3">{formatDuration(b.response_minutes)}</td>
                      <td className="px-4 py-3">
                        {open && b.status === "submitted" ? (
                          <ActionButton
                            action={acceptBid}
                            fields={{ bidId: b.id }}
                            confirmText={`اختيار عرض ${b.office_name} بأتعاب ${formatHalalas(b.fee_halalas)}؟ سيُغلق الطلب أمام بقية العروض.`}
                            className="rounded-lg bg-primary px-3 py-1.5 font-medium whitespace-nowrap text-white hover:bg-primary-hover"
                          >
                            اختيار هذا العرض
                          </ActionButton>
                        ) : (
                          <span className="text-muted">{BID_STATUS_LABEL[b.status]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-border px-6 py-3 text-xs text-muted">
            العروض مغلقة: لا يرى أي مكتب عروض غيره. التقييمات تُفعّل لاحقاً.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <h2 className="font-semibold">تفاصيل الطلب</h2>
          <p>
            <span className="text-muted">الاستعجال: </span>
            {URGENCY_LABEL[request.urgency]}
          </p>
          {request.description && <p className="whitespace-pre-line">{request.description}</p>}
          {request.available_docs.length > 0 && (
            <p>
              <span className="text-muted">المستندات المتوفرة: </span>
              {request.available_docs.join("، ")}
            </p>
          )}
          {details?.private_notes && (
            <p>
              <span className="text-muted">ملاحظاتك الخاصة (للمكتب المختار فقط): </span>
              {details.private_notes}
            </p>
          )}
          {cancellable && (
            <div className="pt-2">
              <ActionButton
                action={cancelRequest}
                fields={{ requestId: request.id }}
                confirmText={paid ? "إلغاء الطلب واسترداد المبلغ كاملاً؟" : "إلغاء الطلب؟"}
                className="rounded-lg border border-border px-3 py-1.5 hover:border-danger hover:text-danger"
              >
                {paid ? "إلغاء الطلب واسترداد المبلغ" : "إلغاء الطلب"}
              </ActionButton>
            </div>
          )}
        </Card>

        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">سجل الطلب</h2>
          <ol className="space-y-2" data-testid="order-events">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="text-muted">{formatDateTime(e.created_at)}</span>
                <span>
                  {STATUS_LABEL[e.to_status]}
                  {e.note && <span className="text-muted"> — {e.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
