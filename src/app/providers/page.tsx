import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServiceCatalog } from "@/lib/providers/queries";
import { SAUDI_CITIES, isSaudiCity } from "@/lib/cities";
import { formatHalalas } from "@/lib/money";
import { VerifiedBadge } from "@/components/verified-badge";
import { Rating } from "@/components/rating";
import { getProviderStats } from "@/lib/providers/stats";
import { rankProviders } from "@/lib/providers/ranking";
import { Card, PageTitle, Select } from "@/components/ui";

export const metadata: Metadata = { title: "تصفح المزوّدين" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProvidersPage({ searchParams }: PageProps<"/providers">) {
  const { service, city } = await searchParams;
  const serviceId = typeof service === "string" && UUID.test(service) ? service : undefined;
  const cityFilter = typeof city === "string" && isSaudiCity(city) ? city : undefined;

  const supabase = await createClient();
  const [catalog, { data: providers }] = await Promise.all([
    getServiceCatalog(),
    supabase.rpc("public_providers", { p_service_type_id: serviceId, p_city: cityFilter }),
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

  return (
    <div className="space-y-6">
      <PageTitle subtitle="مكاتب خدمات عامة مرخّصة وثّقت الإدارة مستنداتها.">
        تصفح المزوّدين
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
            بحث
          </button>
        </form>
        {selectedService && (
          <p className="mt-3 text-sm text-muted">
            السعر الاسترشادي لـ«{selectedService.name_ar}»:{" "}
            {formatHalalas(selectedService.guide_min_halalas)} –{" "}
            {formatHalalas(selectedService.guide_max_halalas)} (أتعاب فقط، دون الرسوم الحكومية)
          </p>
        )}
      </Card>

      {!ranked.length ? (
        <Card>
          <p className="text-muted" data-testid="no-providers">
            لا يوجد مزوّدون مطابقون حالياً.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="providers-list">
          {ranked.map((p) => (
            <li key={p.id}>
              <Link href={`/providers/${p.id}`} className="block h-full">
                <Card className="h-full space-y-2 transition hover:border-primary">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{p.office_name}</h2>
                    <VerifiedBadge />
                  </div>
                  <p className="text-sm text-muted">{p.cities.join("، ")}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-sm">
                    <Rating value={p.avgRating} count={p.reviewsCount} />
                    <span className="text-muted">
                      {p.completedOrders} طلب منجز
                      {p.onTimePct !== null && ` · ${p.onTimePct}% في الموعد`}
                    </span>
                  </p>
                  {p.bio && <p className="line-clamp-2 text-sm">{p.bio}</p>}
                  <p className="text-sm">
                    {selectedService ? "أتعاب الخدمة تبدأ من " : "الأسعار تبدأ من "}
                    <strong>{formatHalalas(p.from_fee_halalas)}</strong>
                    {!selectedService && ` · ${p.services_count} خدمة`}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
