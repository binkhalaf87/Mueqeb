import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { formatHalalas } from "@/lib/money";
import { VerifiedBadge } from "@/components/verified-badge";
import { Card } from "@/components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** يعيد المزوّد المعتمد فقط؛ غير المعتمد غير موجود بالنسبة للعامة */
const getPublicProvider = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_provider", { p_provider_id: id }).maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: PageProps<"/providers/[id]">): Promise<Metadata> {
  const provider = await getPublicProvider((await params).id);
  return { title: provider?.office_name ?? "مزوّد غير موجود" };
}

export default async function PublicProviderPage({ params }: PageProps<"/providers/[id]">) {
  const { id } = await params;
  const provider = await getPublicProvider(id);
  if (!provider) notFound();

  const supabase = await createClient();
  const [{ data: services }, user] = await Promise.all([
    supabase.rpc("public_provider_services", { p_provider_id: provider.id }),
    getCurrentUser(),
  ]);
  // أزرار الطلب لطالب الخدمة؛ والزائر يُدعى للدخول
  const canRequest = !user || user.role === "requester";
  const requestHref = (mode: string, serviceTypeId: string) => {
    const target = `/dashboard/requester/requests/new?mode=${mode}&provider=${provider.id}&service=${serviceTypeId}`;
    return user ? target : `/login?next=${encodeURIComponent(target)}`;
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{provider.office_name}</h1>
          <VerifiedBadge />
        </div>
        <p className="text-muted">يخدم: {provider.cities.join("، ")}</p>
        {provider.bio && <p className="max-w-3xl whitespace-pre-line">{provider.bio}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-3" data-testid="provider-stats">
        <StatPlaceholder label="الطلبات المنجزة" />
        <StatPlaceholder label="التقييم" />
        <StatPlaceholder label="متوسط مدة الإنجاز" />
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">الخدمات والأسعار</h2>
        {!services?.length ? (
          <p className="text-sm text-muted">لا توجد خدمات معروضة حالياً.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="provider-services">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.service_name}</p>
                  <p className="text-sm text-muted">{s.category_name}</p>
                  {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                </div>
                <div className="text-end text-sm">
                  <p>
                    يبدأ من <strong>{formatHalalas(s.fee_halalas)}</strong>
                  </p>
                  <p className="text-muted">خلال {s.duration_days} يوم تقريباً</p>
                </div>
                {canRequest && (
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-col">
                    <Link
                      href={requestHref("direct_listed", s.service_type_id)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-primary-hover"
                    >
                      اطلب بالسعر المعلن
                    </Link>
                    <Link
                      href={requestHref("direct_quote", s.service_type_id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-center text-sm hover:border-primary"
                    >
                      اطلب عرضاً خاصاً
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          الأسعار أتعاب المكتب فقط. الرسوم الحكومية تُدفع مباشرة عبر القنوات الرسمية.
        </p>
      </Card>
    </div>
  );
}

function StatPlaceholder({ label }: { label: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-bold text-muted">—</p>
      <p className="text-xs text-muted">قريباً</p>
    </Card>
  );
}
