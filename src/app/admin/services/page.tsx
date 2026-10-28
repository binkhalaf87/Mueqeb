import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatHalalas, halalasToInput } from "@/lib/money";
import { DELEGATION_LABEL } from "@/lib/providers/constants";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ServiceTypeForm } from "./service-type-form";

export const metadata: Metadata = { title: "أنواع الخدمات" };

export default async function ServicesAdminPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: categories }, { data: listed }] = await Promise.all([
    supabase
      .from("service_categories")
      .select("id, name_ar, service_types(*)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "service_types" }),
    supabase.from("provider_services").select("service_type_id, fee_halalas, active"),
  ]);

  // خدمات مزوّدين معلنة بسعر أقل من الحد الأدنى الحالي (بعد رفعه)
  const belowMin = (typeId: string, min: number) =>
    (listed ?? []).filter((l) => l.service_type_id === typeId && l.active && l.fee_halalas < min)
      .length;
  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, name: c.name_ar }));

  return (
    <div className="space-y-6">
      <PageTitle subtitle="الحد الأدنى يُفرض على العروض الجديدة وأسعار المزوّدين عند حفظها. التغييرات تُسجَّل في سجل الإعدادات.">
        أنواع الخدمات
      </PageTitle>

      <Card className="space-y-3">
        <h2 className="font-semibold">إضافة خدمة</h2>
        <ServiceTypeForm categories={categoryOptions} />
      </Card>

      {(categories ?? []).map((c) => (
        <Card key={c.id} className="space-y-3 p-0">
          <h2 className="border-b border-border px-6 py-3 font-semibold">{c.name_ar}</h2>
          <ul className="divide-y divide-border" data-testid={`services-${c.id}`}>
            {c.service_types.map((t) => {
              const below = belowMin(t.id, t.min_fee_halalas);
              return (
                <li key={t.id} className="space-y-2 px-6 py-3" data-testid="service-type-row">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">{t.name_ar}</span>
                    {!t.active && <Badge>موقوفة</Badge>}
                    <span className="text-muted">
                      الحد الأدنى {formatHalalas(t.min_fee_halalas)} · النطاق{" "}
                      {formatHalalas(t.guide_min_halalas)} – {formatHalalas(t.guide_max_halalas)} ·{" "}
                      {t.delegation_platform === "none"
                        ? "بلا تفويض"
                        : DELEGATION_LABEL[t.delegation_platform]}
                    </span>
                    {below > 0 && (
                      <Badge tone="warning">{below} سعر مزوّد أقل من الحد الحالي</Badge>
                    )}
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">تعديل</summary>
                    <div className="mt-3">
                      <ServiceTypeForm
                        categories={categoryOptions}
                        initial={{
                          id: t.id,
                          categoryId: t.category_id,
                          slug: t.slug,
                          nameAr: t.name_ar,
                          description: t.description ?? "",
                          minFee: halalasToInput(t.min_fee_halalas),
                          guideMin: halalasToInput(t.guide_min_halalas),
                          guideMax: halalasToInput(t.guide_max_halalas),
                          requiredDocs: t.required_docs.join("\n"),
                          delegation: t.delegation_platform,
                          active: t.active,
                        }}
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
