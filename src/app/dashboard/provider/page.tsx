import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import { getMyProvider } from "@/lib/providers/queries";
import { providerStage } from "@/lib/providers/constants";
import { getProviderStats } from "@/lib/providers/stats";
import { ProviderStageBadge } from "@/components/provider-stage-badge";
import { Card, PageTitle } from "@/components/ui";
import { ProviderOrdersPanel } from "./orders-panel";

export const metadata: Metadata = { title: "لوحة المزوّد" };

export default async function ProviderDashboard() {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  const db = await getDb();

  const counts = provider
    ? await db.one<{ docs: number; services: number }>(
        `select
           (select count(*) from public.provider_documents where provider_id = $1) as docs,
           (select count(*) from public.provider_services where provider_id = $1 and active) as services`,
        [provider.id],
      )
    : null;

  const stage = provider ? providerStage(provider) : "draft";
  const performance = provider ? (await getProviderStats([provider.id])).get(provider.id) : null;
  const docsCount = counts?.docs ?? 0;
  const servicesCount = counts?.services ?? 0;

  const steps = [
    { done: Boolean(provider), label: "بيانات المكتب والمدن", href: "/dashboard/provider/profile" },
    {
      done: docsCount >= 4,
      label: `المستندات (${docsCount}/4)`,
      href: "/dashboard/provider/profile#documents",
    },
    {
      done: servicesCount > 0,
      label: `الخدمات والأسعار (${servicesCount})`,
      href: "/dashboard/provider/services",
    },
    {
      done: stage !== "draft",
      label: "الإرسال للتوثيق",
      href: "/dashboard/provider/profile#submit",
    },
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        subtitle={
          stage === "approved"
            ? "طلباتك الجارية ومستحقاتك وأداؤك."
            : "أكمل ملف مكتبك وخدماتك ليظهر للعملاء بعد اعتماد الإدارة."
        }
      >
        {provider?.office_name ?? "لوحة المزوّد"}
      </PageTitle>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">حالة التوثيق</h2>
          <ProviderStageBadge stage={stage} />
        </div>
        {stage === "draft" && (
          <p className="text-sm text-muted">
            لن يظهر مكتبك في التصفح ولن تستقبل طلبات قبل اعتماد الإدارة.
          </p>
        )}
        {stage === "under_review" && (
          <p className="text-sm text-muted">ملفك قيد مراجعة الإدارة. سنبلغك عند الاعتماد.</p>
        )}
        {(stage === "rejected" || stage === "suspended") && provider?.rejection_reason && (
          <p className="text-sm" data-testid="rejection-reason">
            <span className="font-medium">السبب: </span>
            {provider.rejection_reason}
          </p>
        )}
        {stage === "rejected" && (
          <p className="text-sm text-muted">عدّل بياناتك أو مستنداتك ثم أعد الإرسال.</p>
        )}
        {stage === "approved" && provider && (
          <Link href={`/providers/${provider.id}`} className="text-sm text-primary hover:underline">
            عرض صفحتك العامة ←
          </Link>
        )}
      </Card>

      {provider && stage !== "draft" && stage !== "under_review" && (
        <ProviderOrdersPanel providerId={provider.id} />
      )}

      {stage === "approved" && performance && (
        <Card data-testid="provider-performance">
          <h2 className="mb-2 font-semibold">أداؤك</h2>
          <p className="text-sm">
            طلبات منجزة: <strong>{performance.completed_orders}</strong> · متأخرة:{" "}
            <strong>{performance.late_orders}</strong> · الالتزام بالموعد:{" "}
            <strong>{performance.on_time_pct == null ? "—" : `${performance.on_time_pct}%`}</strong>{" "}
            · التقييم:{" "}
            <strong>
              {performance.avg_rating == null
                ? "—"
                : `${Number(performance.avg_rating).toFixed(1)} (${performance.reviews_count})`}
            </strong>
          </p>
        </Card>
      )}

      {!steps.every((step) => step.done) && (
        <Card>
          <h2 className="mb-3 font-semibold">خطوات إكمال الملف</h2>
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`grid size-6 place-items-center rounded-full text-xs ${
                    step.done ? "bg-primary text-white" : "border border-border text-muted"
                  }`}
                >
                  {step.done ? "✓" : ""}
                </span>
                <Link href={step.href} className="hover:text-primary">
                  {step.label}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
