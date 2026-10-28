import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRequestDocuments } from "@/lib/execution/queries";
import { formatHalalas } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/requests/constants";
import { RequestDocumentsList } from "@/components/request-documents";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Card, PageTitle } from "@/components/ui";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "مراجعة نزاع" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE = {
  requester: "العميل",
  provider: "المكتب",
  admin: "الإدارة",
  system: "النظام",
} as const;

export default async function DisputePage({ params }: PageProps<"/admin/disputes/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const { data: dispute } = await supabase
    .from("disputes")
    .select("*")
    .eq("request_id", id)
    .maybeSingle();
  if (!dispute) notFound();

  const [{ data: request }, { data: order }, { data: events }, { data: messages }, documents] =
    await Promise.all([
      supabase
        .from("service_requests")
        .select(
          "status, city, description, delivered_at, delivery_note, is_late, due_at, service_types(name_ar), request_private_details(contact_name, establishment_name)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("orders")
        .select(
          "fee_halalas, client_fee_halalas, provider_commission_bps, total_paid_halalas, settlement, refunded_halalas, providers(office_name)",
        )
        .eq("request_id", id)
        .single(),
      supabase
        .from("order_events")
        .select("id, from_status, to_status, actor_role, note, created_at")
        .eq("request_id", id)
        .order("created_at"),
      supabase
        .from("messages")
        .select("id, sender_role, body, was_masked, created_at")
        .eq("request_id", id)
        .order("id"),
      getRequestDocuments(id),
    ]);
  if (!request || !order) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/disputes" className="text-sm text-primary hover:underline">
        → النزاعات
      </Link>
      <PageTitle
        subtitle={`${request.request_private_details?.establishment_name ?? request.request_private_details?.contact_name ?? ""} ← ${order.providers?.office_name ?? ""}`}
      >
        <span className="flex flex-wrap items-center gap-3">
          نزاع: {request.service_types?.name_ar} <RequestStatusBadge status={request.status} />
        </span>
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-2 text-sm">
            <h2 className="font-semibold">سبب الاعتراض</h2>
            <p data-testid="dispute-reason">{dispute.reason}</p>
            {request.delivery_note && (
              <p>
                <span className="text-muted">وصف التسليم: </span>
                {request.delivery_note}
                {request.is_late && " (سُلّم متأخراً)"}
              </p>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="font-semibold">المستندات</h2>
            <RequestDocumentsList
              documents={documents}
              emptyText="لا توجد مستندات."
              testId="dispute-documents"
            />
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">المحادثة</h2>
            <ol
              className="max-h-96 space-y-2 overflow-y-auto text-sm"
              data-testid="dispute-messages"
            >
              {(messages ?? []).length === 0 && <li className="text-muted">لا توجد رسائل.</li>}
              {(messages ?? []).map((m) => (
                <li key={m.id}>
                  <span className="text-muted">
                    {formatDateTime(m.created_at)} · {ROLE[m.sender_role as keyof typeof ROLE]}:
                  </span>{" "}
                  {m.body}
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">سجل الأحداث</h2>
            <ol className="space-y-1 text-sm" data-testid="dispute-events">
              {(events ?? []).map((e) => (
                <li key={e.id}>
                  <span className="text-muted">{formatDateTime(e.created_at)}</span> —{" "}
                  {STATUS_LABEL[e.to_status]} ({ROLE[e.actor_role as keyof typeof ROLE]})
                  {e.note && <span className="text-muted"> — {e.note}</span>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card className="h-fit space-y-3">
          <h2 className="font-semibold">المبالغ</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>أتعاب المكتب</dt>
              <dd>{formatHalalas(order.fee_halalas)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>رسم الخدمة</dt>
              <dd>{formatHalalas(order.client_fee_halalas)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>المدفوع (في الضمان)</dt>
              <dd>{formatHalalas(order.total_paid_halalas)}</dd>
            </div>
          </dl>
          {dispute.decision ? (
            <p className="text-sm" data-testid="dispute-decision">
              القرار:{" "}
              {dispute.decision === "provider"
                ? "لصالح المكتب"
                : dispute.decision === "full_refund"
                  ? "استرداد كامل"
                  : "استرداد جزئي"}{" "}
              — استُرد {formatHalalas(dispute.refund_halalas ?? 0)}
            </p>
          ) : (
            <DecisionForm
              requestId={id}
              feeSar={order.fee_halalas / 100}
              totalLabel={formatHalalas(order.total_paid_halalas)}
              feeLabel={formatHalalas(order.fee_halalas)}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
