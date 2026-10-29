import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import type { Enums } from "@/lib/db/types";
import { formatDateTime } from "@/lib/format";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "النزاعات" };

export default async function DisputesPage() {
  await requireRole("admin");
  const db = await getDb();
  const disputes = await db.query<{
    request_id: string;
    reason: string;
    opened_at: string;
    status: Enums<"request_status">;
    service_name: string;
  }>(
    `select d.request_id, d.reason, d.opened_at, r.status, t.name_ar as service_name
     from public.disputes d
     join public.service_requests r on r.id = d.request_id
     join public.service_types t on t.id = r.service_type_id
     order by d.opened_at desc`,
  );

  return (
    <div className="space-y-6">
      <PageTitle subtitle="راجع المحادثة والمستندات وسجل الأحداث ثم قرر.">النزاعات</PageTitle>
      <Card className="p-0">
        {!disputes.length ? (
          <p className="p-6 text-sm text-muted">لا توجد نزاعات.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="disputes-list">
            {disputes.map((d) => (
              <li key={d.request_id}>
                <Link
                  href={`/admin/disputes/${d.request_id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-background"
                >
                  <span className="font-medium">{d.service_name}</span>
                  <span className="line-clamp-1 text-sm text-muted">{d.reason}</span>
                  <span className="ms-auto flex items-center gap-3 text-sm text-muted">
                    {formatDateTime(d.opened_at)}
                    <RequestStatusBadge status={d.status} />
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
