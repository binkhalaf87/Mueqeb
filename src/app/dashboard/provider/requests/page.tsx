import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyProvider } from "@/lib/providers/queries";
import { formatHalalas } from "@/lib/money";
import { timeLeft } from "@/lib/format";
import { BID_STATUS_LABEL, MODE_LABEL, URGENCY_LABEL } from "@/lib/requests/constants";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Badge, Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "الطلبات المتاحة" };

export default async function ProviderRequestsPage({
  searchParams,
}: PageProps<"/dashboard/provider/requests">) {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  const { tab } = await searchParams;
  const mine = tab === "mine";

  if (provider?.verification_status !== "approved") {
    return (
      <div>
        <PageTitle>الطلبات المتاحة</PageTitle>
        <Card>
          <p>تظهر الطلبات بعد اعتماد الإدارة لمكتبك.</p>
          <Link href="/dashboard/provider" className="text-sm text-primary hover:underline">
            حالة التوثيق ←
          </Link>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  // RLS يعيد فقط: العامة المفتوحة في خدماتي ومدني، والموجّهة لي، وما قدّمت عليه عرضاً
  const [{ data: requests }, { data: bids }] = await Promise.all([
    supabase
      .from("service_requests")
      .select(
        "id, mode, city, urgency, description, available_docs, status, bids_deadline, target_provider_id, service_types(name_ar)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("bids").select("request_id, status, fee_halalas"),
  ]);
  const bidByRequest = new Map((bids ?? []).map((b) => [b.request_id, b]));

  const rows = (requests ?? []).filter((r) =>
    mine
      ? bidByRequest.has(r.id)
      : r.status === "open" &&
        timeLeft(r.bids_deadline) !== null &&
        bidByRequest.get(r.id)?.status !== "submitted",
  );

  return (
    <div className="space-y-6">
      <PageTitle subtitle="طلبات عامة في خدماتك ومدنك، وطلبات عروض خاصة موجّهة إليك. بيانات العملاء تظهر بعد الترسية فقط.">
        الطلبات المتاحة
      </PageTitle>

      <nav className="flex gap-2" aria-label="تبويبات الطلبات">
        {[
          { href: "/dashboard/provider/requests", label: "متاحة للتقديم", active: !mine },
          { href: "/dashboard/provider/requests?tab=mine", label: "عروضي", active: mine },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              t.active
                ? "border-primary bg-primary-soft text-primary"
                : "border-border hover:border-primary"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted" data-testid="no-requests">
            {mine ? "لم تقدّم عروضاً بعد." : "لا توجد طلبات متاحة حالياً."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="provider-requests">
          {rows.map((r) => {
            const bid = bidByRequest.get(r.id);
            const left = timeLeft(r.bids_deadline);
            return (
              <li key={r.id}>
                <Link href={`/dashboard/provider/requests/${r.id}`} className="block">
                  <Card className="space-y-2 transition hover:border-primary">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{r.service_types?.name_ar}</h2>
                      {r.mode === "direct_quote" && <Badge tone="info">موجّه إليك</Badge>}
                      {r.urgency === "urgent" && (
                        <Badge tone="warning">{URGENCY_LABEL.urgent}</Badge>
                      )}
                      <span className="ms-auto">
                        {mine ? (
                          <RequestStatusBadge status={r.status} />
                        ) : (
                          left && <span className="text-sm text-muted">يغلق خلال {left}</span>
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      {MODE_LABEL[r.mode]} · {r.city}
                    </p>
                    {r.description && <p className="line-clamp-2 text-sm">{r.description}</p>}
                    {bid && (
                      <p className="text-sm">
                        عرضك: {formatHalalas(bid.fee_halalas)} — {BID_STATUS_LABEL[bid.status]}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
