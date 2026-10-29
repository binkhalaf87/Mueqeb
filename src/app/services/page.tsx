import type { Metadata } from "next";
import Link from "next/link";
import { getServiceCatalog } from "@/lib/providers/queries";
import { formatHalalas } from "@/lib/money";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "خدمات التعقيب للمنشآت",
  description:
    "خدمات قوى والتأمينات الاجتماعية ومدد والسجل التجاري وبلدي عبر مكاتب تعقيب مرخّصة: المستندات المطلوبة والأسعار الاسترشادية والمدة.",
  alternates: { canonical: "/services" },
};

export default async function ServicesIndexPage() {
  const catalog = await getServiceCatalog();
  return (
    <div className="space-y-6">
      <PageTitle subtitle="اختر الخدمة لتعرف مستنداتها وسعرها الاسترشادي ومدتها وأفضل المكاتب لها.">
        خدمات التعقيب
      </PageTitle>
      {catalog.map((category) => (
        <Card key={category.id} className="space-y-3">
          <h2 className="font-semibold">{category.name_ar}</h2>
          <ul className="grid gap-2 sm:grid-cols-2" data-testid={`category-${category.slug}`}>
            {category.service_types.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/services/${t.slug}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 hover:border-primary"
                >
                  <span>{t.name_ar}</span>
                  <span className="text-sm text-muted">
                    {formatHalalas(t.guide_min_halalas)} – {formatHalalas(t.guide_max_halalas)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
