import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import type { Enums } from "@/lib/db/types";
import { MODE_LABEL } from "@/lib/requests/constants";
import { formatDateTime } from "@/lib/format";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "طلباتي" };

type Status = Enums<"request_status">;

type Row = {
  id: string;
  mode: Enums<"request_mode">;
  city: string;
  status: Status;
  created_at: string;
  service_name: string | null;
  open_bids: number;
};

/** الخطوة المطلوبة من العميل في كل حالة (إن وُجدت) */
function nextAction(r: Row): string | null {
  switch (r.status) {
    case "open":
      return r.mode === "public" && r.open_bids > 0
        ? `لديك ${r.open_bids} ${r.open_bids === 1 ? "عرض" : "عروض"} — قارن واختر`
        : null;
    case "awarded_unpaid":
      return "أكمل الدفع ليبدأ المكتب";
    case "awaiting_client":
      return "امنح التفويض وارفع المستندات";
    case "delivered":
      return "راجع الإنجاز وأكّده أو اعترض";
    default:
      return null;
  }
}

const ACTIVE: Status[] = [
  "open",
  "awarded_unpaid",
  "paid",
  "awaiting_client",
  "in_progress",
  "delivered",
  "disputed",
];
const DONE: Status[] = ["completed", "resolved"];
const CLOSED: Status[] = ["cancelled", "expired", "draft"];

const TABS = [
  { key: "action", label: "تحتاج إجراءً منك", test: (r: Row) => nextAction(r) !== null },
  { key: "active", label: "جارية", test: (r: Row) => ACTIVE.includes(r.status) },
  { key: "done", label: "مكتملة", test: (r: Row) => DONE.includes(r.status) },
  { key: "closed", label: "ملغاة ومنتهية", test: (r: Row) => CLOSED.includes(r.status) },
  { key: "all", label: "الكل", test: () => true },
] as const;

export default async function RequesterDashboard({
  searchParams,
}: PageProps<"/dashboard/requester">) {
  const user = await requireRole("requester");
  const { tab } = await searchParams;
  const db = await getDb();
  const [account, requests] = await Promise.all([
    db.maybeOne<{
      member_role: Enums<"establishment_member_role">;
      account_type: Enums<"requester_account_type">;
      establishment_name: string | null;
      cr_number: string | null;
    }>(
      `select m.member_role, a.account_type, a.establishment_name, a.cr_number
       from public.establishment_members m
       join public.requester_accounts a on a.id = m.account_id
       where m.user_id = $1 limit 1`,
      [user.id],
    ),
    // العروض المقدَّمة مقروءة لأعضاء حساب الطلب (RLS)
    db.query<Row>(
      `select r.id, r.mode, r.city, r.status, r.created_at, t.name_ar as service_name,
              (select count(*) from public.bids b
               where b.request_id = r.id and b.status = 'submitted') as open_bids
       from public.service_requests r left join public.service_types t on t.id = r.service_type_id
       order by r.created_at desc`,
    ),
  ]);

  const counts = Object.fromEntries(TABS.map((t) => [t.key, requests.filter(t.test).length]));
  const current = TABS.find((t) => t.key === tab) ?? TABS.find((t) => t.key === "all")!;
  const rows = requests.filter(current.test);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="انشر طلباً عاماً لتصلك عروض مغلقة، أو اطلب مباشرة من ملف أي مكتب.">
        طلباتي
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Card className="space-y-1" data-testid="requester-account">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">حسابك</h2>
            <Link href="/dashboard/account" className="text-sm text-primary hover:underline">
              تعديل الحساب
            </Link>
          </div>
          {account?.account_type === "establishment" ? (
            <p>
              منشأة: {account.establishment_name} — سجل تجاري{" "}
              <span dir="ltr">{account.cr_number}</span>
              {account.member_role === "owner" && " (مالك)"}
            </p>
          ) : (
            <p>حساب فردي</p>
          )}
        </Card>
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard/requester/requests/new"
            className="rounded-lg bg-primary px-4 py-2.5 text-center font-medium text-white hover:bg-primary-hover"
          >
            انشر طلباً عاماً
          </Link>
          <Link
            href="/providers"
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-center font-medium hover:border-primary"
          >
            اطلب من مكتب محدد
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="requester-stats">
        {[
          { key: "action", label: "تحتاج إجراءً منك", highlight: counts.action > 0 },
          { key: "active", label: "طلبات جارية" },
          { key: "done", label: "مكتملة" },
          { key: "closed", label: "ملغاة ومنتهية" },
        ].map((s) => (
          <Link key={s.key} href={`/dashboard/requester?tab=${s.key}`}>
            <Card
              className={`h-full space-y-1 transition hover:border-primary ${s.highlight ? "border-amber-400" : ""}`}
            >
              <p className="text-sm text-muted">{s.label}</p>
              <p className="text-2xl font-bold">{counts[s.key]}</p>
            </Card>
          </Link>
        ))}
      </div>

      <nav aria-label="تصفية الطلبات" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/requester?tab=${t.key}`}
            aria-current={t.key === current.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              t.key === current.key
                ? "border-primary bg-primary-soft text-primary"
                : "border-border hover:border-primary"
            }`}
          >
            {t.label} ({counts[t.key]})
          </Link>
        ))}
      </nav>

      <Card className="p-0">
        {!rows.length ? (
          <p className="p-6 text-sm text-muted">
            {requests.length ? "لا توجد طلبات في هذا التصنيف." : "لا توجد طلبات بعد."}
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="my-requests">
            {rows.map((r) => {
              const action = nextAction(r);
              return (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/requester/requests/${r.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-background"
                  >
                    <span className="font-medium">{r.service_name}</span>
                    <span className="text-sm text-muted">
                      {MODE_LABEL[r.mode]} · {r.city}
                    </span>
                    {action && (
                      <span
                        className="text-sm font-medium text-amber-700 dark:text-amber-300"
                        data-testid="next-action"
                      >
                        {action} ←
                      </span>
                    )}
                    <span className="ms-auto flex items-center gap-3 text-sm text-muted">
                      {formatDateTime(r.created_at)}
                      <RequestStatusBadge status={r.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
