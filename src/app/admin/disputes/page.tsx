import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "النزاعات" };

export default async function DisputesPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: disputes } = await supabase
    .from("disputes")
    .select(
      "request_id, reason, opened_at, decision, service_requests(status, city, service_types(name_ar))",
    )
    .order("opened_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageTitle subtitle="راجع المحادثة والمستندات وسجل الأحداث ثم قرر.">النزاعات</PageTitle>
      <Card className="p-0">
        {!disputes?.length ? (
          <p className="p-6 text-sm text-muted">لا توجد نزاعات.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="disputes-list">
            {disputes.map((d) => (
              <li key={d.request_id}>
                <Link
                  href={`/admin/disputes/${d.request_id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-background"
                >
                  <span className="font-medium">{d.service_requests?.service_types?.name_ar}</span>
                  <span className="line-clamp-1 text-sm text-muted">{d.reason}</span>
                  <span className="ms-auto flex items-center gap-3 text-sm text-muted">
                    {formatDateTime(d.opened_at)}
                    {d.service_requests && (
                      <RequestStatusBadge status={d.service_requests.status} />
                    )}
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
