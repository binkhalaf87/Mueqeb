import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { providerStage, STAGE_LABEL, type ProviderStage } from "@/lib/providers/constants";
import { ProviderStageBadge } from "@/components/provider-stage-badge";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "توثيق المزوّدين" };

const TABS: ProviderStage[] = ["under_review", "approved", "rejected", "suspended", "draft"];

export default async function AdminProvidersPage({ searchParams }: PageProps<"/admin/providers">) {
  await requireRole("admin");
  const { stage: stageParam } = await searchParams;
  const stage = TABS.find((t) => t === stageParam) ?? "under_review";

  const db = await getDb();
  const data = await db.query<
    Pick<
      Tables<"providers">,
      | "id"
      | "office_name"
      | "cr_number"
      | "cities"
      | "verification_status"
      | "submitted_at"
      | "created_at"
    >
  >(
    `select id, office_name, cr_number, cities, verification_status, submitted_at, created_at
     from public.providers order by submitted_at asc nulls last`,
  );

  const all = data.map((p) => ({ ...p, stage: providerStage(p) }));
  const counts = new Map<ProviderStage, number>();
  for (const p of all) counts.set(p.stage, (counts.get(p.stage) ?? 0) + 1);
  const rows = all.filter((p) => p.stage === stage);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="راجع مستندات المكاتب واعتمدها قبل ظهورها للعملاء.">
        توثيق المزوّدين
      </PageTitle>

      <nav aria-label="حالات التوثيق" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/providers?stage=${t}`}
            aria-current={t === stage ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              t === stage
                ? "border-primary bg-primary-soft text-primary"
                : "border-border hover:border-primary"
            }`}
          >
            {STAGE_LABEL[t]} ({counts.get(t) ?? 0})
          </Link>
        ))}
      </nav>

      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">لا يوجد مزوّدون في هذه الحالة.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="admin-providers">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/providers/${p.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:bg-background"
                >
                  <span className="font-medium">{p.office_name}</span>
                  <span className="text-sm text-muted" dir="ltr">
                    {p.cr_number}
                  </span>
                  <span className="text-sm text-muted">{p.cities.join("، ")}</span>
                  <span className="ms-auto flex items-center gap-3 text-sm text-muted">
                    {p.submitted_at && (
                      <span>
                        أُرسل {new Date(p.submitted_at).toLocaleDateString("ar-SA-u-nu-latn")}
                      </span>
                    )}
                    <ProviderStageBadge stage={p.stage} />
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
