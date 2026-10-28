import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyProvider } from "@/lib/providers/queries";
import { formatHalalas, halalasToInput } from "@/lib/money";
import { timeLeft } from "@/lib/format";
import { BID_STATUS_LABEL, MODE_LABEL, URGENCY_LABEL } from "@/lib/requests/constants";
import { withdrawBid } from "@/app/actions/bids";
import { ActionButton } from "@/components/action-button";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Badge, Card, PageTitle } from "@/components/ui";
import { BidForm } from "./bid-form";
import { ProviderExecutionPanel } from "./execution-panel";
import { ReviewsSection } from "@/components/reviews-section";
import { Chat } from "@/components/chat";
import { getThreadMessages } from "@/lib/execution/queries";

export const metadata: Metadata = { title: "تفاصيل طلب" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProviderRequestPage({
  params,
}: PageProps<"/dashboard/provider/requests/[id]">) {
  const user = await requireRole("provider");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const provider = await getMyProvider(user.id);
  if (provider?.verification_status !== "approved") notFound();

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("service_requests")
    .select(
      "id, mode, city, urgency, description, available_docs, status, bids_deadline, service_types(name_ar, min_fee_halalas, guide_min_halalas, guide_max_halalas)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  // عرضي فقط (RLS)، والبيانات الخاصة تظهر فقط إذا رُسي الطلب عليّ (RLS)
  const [{ data: myBid }, { data: details }, { data: order }, { data: clientStats }] =
    await Promise.all([
      supabase.from("bids").select("*").eq("request_id", id).maybeSingle(),
      supabase.from("request_private_details").select("*").eq("request_id", id).maybeSingle(),
      // الطلب المالي يظهر للمزوّد المُرسى عليه فقط (RLS)
      supabase
        .from("orders")
        .select(
          "fee_halalas, provider_commission_bps, provider_commission_halalas, provider_net_halalas, payment_status",
        )
        .eq("request_id", id)
        .maybeSingle(),
      // سجل العميل بلا هوية: متوسط تقييمه وعدد طلباته المكتملة
      supabase.rpc("requester_stats_for_request", { p_request_id: id }).single(),
    ]);

  const left = timeLeft(request.bids_deadline);
  const canBid =
    request.mode !== "direct_listed" &&
    request.status === "open" &&
    Boolean(left) &&
    (!myBid || myBid.status === "submitted" || myBid.status === "withdrawn");
  const awardedToMe = myBid?.status === "accepted";
  // خيط المحادثة: إذا قدّمتُ عرضاً أو كان الطلب موجّهاً إليّ
  const showChat = Boolean(myBid) || request.mode === "direct_quote";
  const messages = showChat ? await getThreadMessages(request.id, provider.id) : [];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/provider/requests" className="text-sm text-primary hover:underline">
        → الطلبات
      </Link>
      <PageTitle subtitle={`${MODE_LABEL[request.mode]} · ${request.city}`}>
        <span className="flex flex-wrap items-center gap-3">
          {request.service_types?.name_ar} <RequestStatusBadge status={request.status} />
        </span>
      </PageTitle>

      <Card className="space-y-2 text-sm" data-testid="request-summary">
        <div className="flex flex-wrap gap-2">
          {request.urgency === "urgent" && <Badge tone="warning">{URGENCY_LABEL.urgent}</Badge>}
          {request.status === "open" && (
            <span className="text-muted">
              {left ? `تُستقبل العروض لمدة ${left}` : "انتهت مهلة العروض"}
            </span>
          )}
        </div>
        {request.description && <p className="whitespace-pre-line">{request.description}</p>}
        <p>
          <span className="text-muted">المستندات المتوفرة لدى العميل: </span>
          {request.available_docs.length ? request.available_docs.join("، ") : "لم يحدد"}
        </p>
        {request.service_types && (
          <p className="text-muted">
            الحد الأدنى للأتعاب: {formatHalalas(request.service_types.min_fee_halalas)} · النطاق
            الاسترشادي الظاهر للعميل: {formatHalalas(request.service_types.guide_min_halalas)} –{" "}
            {formatHalalas(request.service_types.guide_max_halalas)}
          </p>
        )}
        <p data-testid="client-stats">
          <span className="text-muted">سجل العميل: </span>
          {clientStats?.avg_rating == null ? (
            "لا تقييمات بعد"
          ) : (
            <>
              تقييمه <strong>{Number(clientStats.avg_rating).toFixed(1)}</strong>/5 (
              {clientStats.reviews_count})
            </>
          )}{" "}
          · طلبات مكتملة: <strong>{clientStats?.completed_requests ?? 0}</strong>
        </p>
        <p className="text-xs text-muted">اسم العميل وبيانات تواصله تظهر لك فقط إذا اختار عرضك.</p>
      </Card>

      {awardedToMe && details && (
        <Card className="space-y-1 border-primary text-sm" data-testid="client-details">
          <h2 className="font-semibold">رُسي الطلب عليك — بيانات العميل</h2>
          <p>الاسم: {details.contact_name}</p>
          {details.establishment_name && (
            <p>
              المنشأة: {details.establishment_name} — سجل <span dir="ltr">{details.cr_number}</span>
            </p>
          )}
          {details.contact_phone && (
            <p>
              الجوال: <span dir="ltr">{details.contact_phone}</span>
            </p>
          )}
          {details.contact_email && <p>البريد: {details.contact_email}</p>}
          {details.private_notes && <p>ملاحظات العميل: {details.private_notes}</p>}
          <p className="pt-1 text-xs text-muted">
            تبدأ الخدمة بعد دفع العميل. لا تطلب من العميل أبداً كلمات مرور أو رموز تحقق لحساباته
            الحكومية؛ التفويض يتم عبر المنصات الرسمية فقط.
          </p>
        </Card>
      )}

      {awardedToMe && order && (
        <Card className="space-y-2 text-sm" data-testid="provider-order">
          <h2 className="font-semibold">المستحقات</h2>
          <dl className="grid gap-1 sm:max-w-sm">
            <div className="flex justify-between">
              <dt>أتعابك</dt>
              <dd>{formatHalalas(order.fee_halalas)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>عمولة المنصة ({order.provider_commission_bps / 100}%)</dt>
              <dd>− {formatHalalas(order.provider_commission_halalas)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>صافي مستحقك</dt>
              <dd>{formatHalalas(order.provider_net_halalas)}</dd>
            </div>
          </dl>
          <p className="text-muted">
            {order.payment_status === "paid"
              ? "دفع العميل والمبلغ محفوظ لدى المنصة؛ يُستحق لك بعد تأكيد العميل للإنجاز."
              : order.payment_status === "refunded"
                ? "أُلغي الطلب وأُعيد المبلغ للعميل."
                : "بانتظار دفع العميل. لا تبدأ العمل قبل الدفع."}
          </p>
        </Card>
      )}

      {awardedToMe && <ProviderExecutionPanel requestId={request.id} />}
      {awardedToMe && <ReviewsSection requestId={request.id} role="provider" />}

      {myBid && (
        <Card className="space-y-2 text-sm" data-testid="my-bid">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">عرضك</h2>
            <Badge tone={myBid.status === "accepted" ? "success" : "neutral"}>
              {BID_STATUS_LABEL[myBid.status]}
            </Badge>
          </div>
          <p>
            الأتعاب: <strong>{formatHalalas(myBid.fee_halalas)}</strong> · المدة:{" "}
            {myBid.duration_days} يوم
            {myBid.expected_gov_fees_halalas > 0 &&
              ` · رسوم حكومية متوقعة ${formatHalalas(myBid.expected_gov_fees_halalas)}`}
          </p>
          {myBid.status === "submitted" && request.status === "open" && (
            <ActionButton
              action={withdrawBid}
              fields={{ bidId: myBid.id }}
              confirmText="سحب عرضك؟ يمكنك التقديم مجدداً قبل انتهاء المهلة."
              className="rounded-lg border border-border px-3 py-1.5 hover:border-danger hover:text-danger"
            >
              سحب العرض
            </ActionButton>
          )}
        </Card>
      )}

      {canBid && request.service_types && (
        <Card>
          <h2 className="mb-1 font-semibold">
            {myBid?.status === "submitted" ? "تعديل عرضك" : "قدّم عرضك"}
          </h2>
          <p className="mb-4 text-sm text-muted">
            عرضك مغلق: لا يراه إلا العميل، ولا ترى عروض غيرك.
          </p>
          <BidForm
            requestId={request.id}
            minFee={request.service_types.min_fee_halalas}
            initial={
              myBid && myBid.status === "submitted"
                ? {
                    fee: halalasToInput(myBid.fee_halalas),
                    govFees: myBid.expected_gov_fees_halalas
                      ? halalasToInput(myBid.expected_gov_fees_halalas)
                      : "",
                    durationDays: String(myBid.duration_days),
                    includes: myBid.includes,
                    needsFromClient: myBid.needs_from_client,
                  }
                : undefined
            }
          />
        </Card>
      )}

      {showChat && (
        <Chat
          requestId={request.id}
          providerId={provider.id}
          initialMessages={messages}
          currentUserId={user.id}
          title="المحادثة مع العميل"
          closed={["completed", "resolved", "cancelled", "expired"].includes(request.status)}
        />
      )}
    </div>
  );
}
