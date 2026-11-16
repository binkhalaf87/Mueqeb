import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/server";
import { getServiceCatalog } from "@/lib/providers/queries";
import { SAUDI_CITIES, isSaudiCity } from "@/lib/cities";
import { formatHalalas } from "@/lib/money";
import { VerifiedBadge } from "@/components/verified-badge";
import { Rating } from "@/components/rating";
import { getProviderStats } from "@/lib/providers/stats";
import { rankProviders } from "@/lib/providers/ranking";
import { Card, PageTitle, Select } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "مكاتب التعقيب والخدمات العامة | مُعقّب" },
  description:
    "اختر الخدمة والمدينة للاطلاع على مكاتب التعقيب المتاحة على مُعقّب وتفاصيل خدماتها وتقييمات العملاء المتاحة.",
  alternates: { canonical: "/providers" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProvidersPage({ searchParams }: PageProps<"/providers">) {
  const { service, city } = await searchParams;
  const serviceId = typeof service === "string" && UUID.test(service) ? service : undefined;
  const cityFilter = typeof city === "string" && isSaudiCity(city) ? city : undefined;

  const db = await getDb();
  const [catalog, { data: providers }] = await Promise.all([
    getServiceCatalog(),
    db.rpc("public_providers", { p_service_type_id: serviceId, p_city: cityFilter }),
  ]);
  // الترتيب حسب المعادلة الموثقة في src/lib/providers/ranking.ts
  const statsById = await getProviderStats((providers ?? []).map((p) => p.id));
  const ranked = rankProviders(
    (providers ?? []).map((p) => {
      const st = statsById.get(p.id);
      return {
        ...p,
        name: p.office_name,
        avgRating: st?.avg_rating == null ? null : Number(st.avg_rating),
        reviewsCount: st?.reviews_count ?? 0,
        completedOrders: st?.completed_orders ?? 0,
        onTimePct: st?.on_time_pct ?? null,
      };
    }),
  );
  const selectedService = catalog.flatMap((c) => c.service_types).find((t) => t.id === serviceId);
  const filtered = Boolean(serviceId || cityFilter);
  // أسماء الخدمات المتاحة لكل مكتب (للبطاقة)
  const serviceNames = new Map(
    await Promise.all(
      ranked.map(async (p) => {
        const { data } = await db.rpc("public_provider_services", { p_provider_id: p.id });
        return [p.id, (data ?? []).map((x) => x.service_name)] as const;
      }),
    ),
  );

  return (
    <div className="space-y-6">
      <PageTitle subtitle="اختر الخدمة والمدينة للاطلاع على المكاتب المتاحة وتفاصيل خدماتها.">
        ابحث عن مكتب تعقيب
      </PageTitle>

      <Card>
        <form className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" role="search">
          <Select label="الخدمة" name="service" defaultValue={serviceId ?? ""}>
            <option value="">كل الخدمات</option>
            {catalog.map((category) => (
              <optgroup key={category.id} label={category.name_ar}>
                {category.service_types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name_ar}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select label="المدينة" name="city" defaultValue={cityFilter ?? ""}>
            <option value="">كل المدن</option>
            {SAUDI_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-primary-hover"
          >
            عرض المكاتب
          </button>
        </form>
        {selectedService && (
          <p className="mt-3 text-sm text-muted">
            <Link
              href={`/services/${selectedService.slug}`}
              className="text-primary hover:underline"
            >
              تفاصيل خدمة «{selectedService.name_ar}» ومتطلباتها
            </Link>
          </p>
        )}
      </Card>

      {!ranked.length ? (
        <Card>
          <p className="text-muted" data-testid="no-providers">
            {filtered
              ? "لا توجد مكاتب تطابق خياراتك حاليًا. جرّب تغيير الخدمة أو المدينة."
              : "لا توجد مكاتب متاحة للعرض حاليًا."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="providers-list">
          {ranked.map((p) => {
            const names = serviceNames.get(p.id) ?? [];
            return (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      <Link href={`/providers/${p.id}`} className="hover:text-primary">
                        {p.office_name}
                      </Link>
                    </h2>
                    <VerifiedBadge />
                  </div>
                  <p className="text-sm text-muted">{p.cities.join("، ")}</p>
                  {names.length > 0 && (
                    <p className="text-sm">
                      الخدمات المتاحة: {names.slice(0, 3).join("، ")}
                      {names.length > 3 && ` و${names.length - 3} غيرها`}
                    </p>
                  )}
                  <p className="flex flex-wrap items-center gap-x-3 text-sm">
                    <Rating
                      value={p.avgRating}
                      count={p.avgRating == null ? undefined : p.reviewsCount}
                    />
                    {p.completedOrders > 0 && (
                      <span className="text-muted">{p.completedOrders} طلب مكتمل عبر المنصة</span>
                    )}
                  </p>
                  {p.from_fee_halalas ? (
                    <p className="text-sm">
                      {selectedService ? "أتعابه المعلنة لهذه الخدمة: " : "أسعاره المعلنة من "}
                      <strong>{formatHalalas(p.from_fee_halalas)}</strong>
                    </p>
                  ) : null}
                  <Link
                    href={`/providers/${p.id}`}
                    className="mt-auto self-start text-sm font-medium text-primary hover:underline"
                  >
                    عرض ملف المكتب ←
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
