import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getServiceCatalog } from "@/lib/providers/queries";
import { PageTitle } from "@/components/ui";
import { RequestForm, type ProviderTarget, type ServiceOption } from "./request-form";

export const metadata: Metadata = { title: "طلب جديد" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewRequestPage({
  searchParams,
}: PageProps<"/dashboard/requester/requests/new">) {
  const user = await requireRole("requester");
  const params = await searchParams;
  const mode =
    params.mode === "direct_listed" || params.mode === "direct_quote" ? params.mode : "public";
  const providerId = typeof params.provider === "string" ? params.provider : "";
  const serviceId = typeof params.service === "string" ? params.service : "";

  const supabase = await createClient();
  const [catalog, { data: accounts }] = await Promise.all([
    getServiceCatalog(),
    supabase
      .from("establishment_members")
      .select("account_id, requester_accounts(account_type, establishment_name)")
      .eq("user_id", user.id),
  ]);

  const options: ServiceOption[] = catalog.flatMap((c) =>
    c.service_types.map((t) => ({
      id: t.id,
      name: t.name_ar,
      category: c.name_ar,
      guideMin: t.guide_min_halalas,
      guideMax: t.guide_max_halalas,
      requiredDocs: t.required_docs,
      delegation: t.delegation_platform,
    })),
  );

  let provider: ProviderTarget | undefined;
  if (mode !== "public") {
    if (!UUID.test(providerId) || !UUID.test(serviceId)) notFound();
    const [{ data: profile }, { data: services }] = await Promise.all([
      supabase.rpc("public_provider", { p_provider_id: providerId }).maybeSingle(),
      supabase.rpc("public_provider_services", { p_provider_id: providerId }),
    ]);
    const listed = services?.find((s) => s.service_type_id === serviceId);
    if (!profile || !listed) notFound();
    provider = {
      id: profile.id,
      officeName: profile.office_name,
      cities: profile.cities,
      feeHalalas: listed.fee_halalas,
      durationDays: listed.duration_days,
    };
  }

  const title =
    mode === "public"
      ? "انشر طلباً عاماً"
      : mode === "direct_listed"
        ? `اطلب من ${provider!.officeName} بالسعر المعلن`
        : `اطلب عرضاً خاصاً من ${provider!.officeName}`;
  const subtitle =
    mode === "public"
      ? "يصل طلبك للمكاتب الموثّقة في خدمتك ومدينتك، فتقدم عروضاً مغلقة لا يرى أحدها الآخر."
      : mode === "direct_listed"
        ? "يُرسل الطلب للمكتب مباشرة بسعره المعلن، ثم تنتقل للدفع."
        : "يصلك عرض سعر من هذا المكتب وحده، ثم تقرر.";

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle subtitle={subtitle}>{title}</PageTitle>
      <RequestForm
        mode={mode}
        options={options}
        initialServiceId={mode === "public" ? (UUID.test(serviceId) ? serviceId : "") : serviceId}
        provider={provider}
        accounts={(accounts ?? []).map((a) => ({
          id: a.account_id,
          label:
            a.requester_accounts?.account_type === "establishment"
              ? `منشأة: ${a.requester_accounts.establishment_name}`
              : "حساب فردي",
        }))}
      />
    </div>
  );
}
