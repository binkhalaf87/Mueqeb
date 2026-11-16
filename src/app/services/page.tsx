import type { Metadata } from "next";
import Link from "next/link";
import { getServiceCatalog } from "@/lib/providers/queries";
import { getDb } from "@/lib/db/server";
import { formatHalalas } from "@/lib/money";
import { CATEGORY_PLATFORM, matchesService } from "@/lib/services/search";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "خدمات التعقيب للمنشآت | مُعقّب" },
  description:
    "خدمات قوى والتأمينات الاجتماعية ومدد والسجل التجاري وبلدي: وصف كل خدمة ومتطلباتها والمكاتب المتاحة لتقديمها.",
  alternates: { canonical: "/services" },
};

export default async function ServicesIndexPage({ searchParams }: PageProps<"/services">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const catalog = await getServiceCatalog();

  // أقل سعر معلن فعلياً من مكتب لكل خدمة (لا نعرض نطاقات تقديرية كأسعار سوق)
  const db = await getDb();
  const allTypes = catalog.flatMap((c) => c.service_types);
  const overviews = await Promise.all(
    allTypes.map(async (t) => {
      const { data } = await db.rpc("public_service_overview", { p_service_type_id: t.id });
      return [t.id, data?.[0]] as const;
    }),
  );
  const overviewById = new Map(overviews);

  const groups = catalog
    .map((c) => ({ ...c, service_types: c.service_types.filter((t) => matchesService(t, query)) }))
    .filter((c) => c.service_types.length);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="اختر معاملتك للاطلاع على وصف الخدمة ومتطلباتها والمكاتب المتاحة لتقديمها.">
        خدمات التعقيب للمنشآت
      </PageTitle>

      <form role="search" className="flex flex-wrap items-end gap-3" action="/services">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="service-search" className="block text-sm font-medium">
            ابحث عن خدمة
          </label>
          <input
            id="service-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="مثل: نقل خدمات موظف أو تجديد رخصة تجارية"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-primary-hover"
        >
          بحث
        </button>
        {query && (
          <Link href="/services" className="py-2 text-sm text-primary hover:underline">
            عرض كل الخدمات
          </Link>
        )}
      </form>

      {!groups.length && (
        <Card data-testid="no-services">
          <p className="text-muted">لا توجد خدمة تطابق بحثك. جرّب كلمة أخرى أو تصفّح كل الخدمات.</p>
        </Card>
      )}

      {groups.map((category) => (
        <Card key={category.id} id={category.slug} className="scroll-mt-6 space-y-3">
          <h2 className="font-semibold">{category.name_ar}</h2>
          <ul className="grid gap-3 sm:grid-cols-2" data-testid={`category-${category.slug}`}>
            {category.service_types.map((t) => {
              const from = overviewById.get(t.id)?.from_fee_halalas;
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3"
                  data-testid="service-card"
                >
                  <span className="font-medium">{t.name_ar}</span>
                  {t.description && <span className="text-sm text-muted">{t.description}</span>}
                  <span className="text-xs text-muted">
                    المنصة ذات الصلة: {CATEGORY_PLATFORM[category.slug] ?? category.name_ar}
                  </span>
                  <span className="text-sm">
                    {from
                      ? `أتعاب معلنة من مكاتب المنصة: من ${formatHalalas(from)}`
                      : "تُحدد أتعاب المكتب في عرض السعر."}
                  </span>
                  <Link
                    href={`/services/${t.slug}`}
                    className="mt-1 self-start text-sm font-medium text-primary hover:underline"
                  >
                    تفاصيل الخدمة ←
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
