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

export default async function RequesterDashboard() {
  const user = await requireRole("requester");
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
    db.query<{
      id: string;
      mode: Enums<"request_mode">;
      city: string;
      status: Enums<"request_status">;
      created_at: string;
      service_name: string | null;
    }>(
      `select r.id, r.mode, r.city, r.status, r.created_at, t.name_ar as service_name
       from public.service_requests r left join public.service_types t on t.id = r.service_type_id
       order by r.created_at desc`,
    ),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="انشر طلباً عاماً لتصلك عروض مغلقة، أو اطلب مباشرة من ملف أي مكتب.">
        طلباتي
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Card className="space-y-1" data-testid="requester-account">
          <h2 className="font-semibold">حسابك</h2>
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

      <Card className="p-0">
        {!requests.length ? (
          <p className="p-6 text-sm text-muted">لا توجد طلبات بعد.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="my-requests">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/requester/requests/${r.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-background"
                >
                  <span className="font-medium">{r.service_name}</span>
                  <span className="text-sm text-muted">
                    {MODE_LABEL[r.mode]} · {r.city}
                  </span>
                  <span className="ms-auto flex items-center gap-3 text-sm text-muted">
                    {formatDateTime(r.created_at)}
                    <RequestStatusBadge status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
