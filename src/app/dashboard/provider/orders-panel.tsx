import Link from "next/link";
import { getDb } from "@/lib/db/server";
import type { Enums } from "@/lib/db/types";
import { formatHalalas } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Card } from "@/components/ui";

type Status = Enums<"request_status">;

type Order = {
  request_id: string;
  status: Status;
  city: string;
  service_name: string | null;
  due_at: string | null;
  is_late: boolean;
  delegation_confirmed_at: string | null;
  delegation_platform: Enums<"delegation_platform"> | null;
  provider_net_halalas: number;
};

/** ما ينتظره كل طلب من المكتب (أو ممن ينتظر) */
function nextStep(o: Order): { text: string; mine: boolean } | null {
  switch (o.status) {
    case "paid":
    case "awaiting_client": {
      const ready = o.delegation_platform === "none" || Boolean(o.delegation_confirmed_at);
      return ready
        ? { text: "ابدأ التنفيذ", mine: true }
        : { text: "بانتظار تفويض العميل ومستنداته", mine: false };
    }
    case "in_progress":
      return { text: o.is_late ? "متأخر — سلّم الإنجاز" : "سلّم الإنجاز مع الإثبات", mine: true };
    case "delivered":
      return { text: "بانتظار تأكيد العميل", mine: false };
    case "disputed":
      return { text: "نزاع قيد مراجعة الإدارة", mine: false };
    default:
      return null;
  }
}

const ACTIVE: Status[] = ["paid", "awaiting_client", "in_progress", "delivered", "disputed"];

/** طلبات المكتب المُرساة عليه وعروضه ومستحقاته — كلها بصلاحيات المزوّد (RLS) */
export async function ProviderOrdersPanel({ providerId }: { providerId: string }) {
  const db = await getDb();
  const [orders, bids, earnings] = await Promise.all([
    db.query<Order>(
      `select o.request_id, r.status, r.city, t.name_ar as service_name, r.due_at, r.is_late,
              r.delegation_confirmed_at, t.delegation_platform, o.provider_net_halalas
       from public.orders o
       join public.service_requests r on r.id = o.request_id
       left join public.service_types t on t.id = r.service_type_id
       where o.provider_id = $1
       order by r.created_at desc`,
      [providerId],
    ),
    db.one<{ submitted: number }>(
      `select count(*) filter (where b.status = 'submitted') as submitted
       from public.bids b where b.provider_id = $1`,
      [providerId],
    ),
    db.rpc("my_provider_earnings"),
  ]);

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const needsMe = active.filter((o) => nextStep(o)?.mine);
  const completed = orders.filter((o) => o.status === "completed" || o.status === "resolved");
  const money = (earnings.data ?? {}) as {
    payable_halalas?: number;
    paid_out_halalas?: number;
    in_escrow_halalas?: number;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="provider-order-stats">
        {[
          { label: "تحتاج إجراءً منك", value: needsMe.length, highlight: needsMe.length > 0 },
          { label: "طلبات جارية", value: active.length },
          {
            label: "عروض بانتظار العميل",
            value: bids.submitted,
            href: "/dashboard/provider/requests?tab=mine",
          },
          { label: "طلبات مكتملة", value: completed.length },
        ].map((s) => {
          const card = (
            <Card
              className={`h-full space-y-1 ${s.highlight ? "border-amber-400" : ""} ${s.href ? "transition hover:border-primary" : ""}`}
            >
              <p className="text-sm text-muted">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </Card>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          );
        })}
      </div>

      <Card className="p-0" data-testid="provider-active-orders">
        <h2 className="border-b border-border px-6 py-3 font-semibold">طلباتي الجارية</h2>
        {!active.length ? (
          <p className="p-6 text-sm text-muted">
            لا توجد طلبات جارية. تصفح{" "}
            <Link href="/dashboard/provider/requests" className="text-primary hover:underline">
              الطلبات المتاحة
            </Link>{" "}
            وقدّم عروضك.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((o) => {
              const step = nextStep(o);
              return (
                <li key={o.request_id}>
                  <Link
                    href={`/dashboard/provider/requests/${o.request_id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-background"
                  >
                    <span className="font-medium">{o.service_name}</span>
                    <span className="text-sm text-muted">{o.city}</span>
                    {step && (
                      <span
                        className={`text-sm font-medium ${
                          step.mine ? "text-amber-700 dark:text-amber-300" : "text-muted"
                        }`}
                      >
                        {step.text}
                        {step.mine && " ←"}
                      </span>
                    )}
                    <span className="ms-auto flex items-center gap-3 text-sm text-muted">
                      {o.due_at && `التسليم ${formatDateTime(o.due_at)}`}
                      <RequestStatusBadge status={o.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3" data-testid="provider-earnings">
        <h2 className="font-semibold">مستحقاتي</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">مستحق لك (بانتظار الصرف)</dt>
            <dd className="text-xl font-bold">{formatHalalas(money.payable_halalas ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">محجوز حتى تأكيد الإنجاز</dt>
            <dd className="text-xl font-bold">{formatHalalas(money.in_escrow_halalas ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">صُرف لك</dt>
            <dd className="text-xl font-bold">{formatHalalas(money.paid_out_halalas ?? 0)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          صافي أتعابك بعد عمولة المنصة، من دفتر الحسابات. الصرف يتم بتحويل بنكي من الإدارة.
        </p>
      </Card>
    </div>
  );
}
