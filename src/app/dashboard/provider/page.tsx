import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyProvider } from "@/lib/providers/queries";
import { providerStage } from "@/lib/providers/constants";
import { getProviderStats } from "@/lib/providers/stats";
import { ProviderStageBadge } from "@/components/provider-stage-badge";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "لوحة المزوّد" };

export default async function ProviderDashboard() {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  const supabase = await createClient();

  const [docs, services] = provider
    ? await Promise.all([
        supabase
          .from("provider_documents")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", provider.id),
        supabase
          .from("provider_services")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", provider.id)
          .eq("active", true),
      ])
    : [null, null];

  const stage = provider ? providerStage(provider) : "draft";
  const performance = provider ? (await getProviderStats([provider.id])).get(provider.id) : null;
  const docsCount = docs?.count ?? 0;
  const servicesCount = services?.count ?? 0;

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
      <PageTitle subtitle="أكمل ملف مكتبك وخدماتك ليظهر للعملاء بعد اعتماد الإدارة.">
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
    </div>
  );
}
