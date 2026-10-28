import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyProvider, getServiceCatalog } from "@/lib/providers/queries";
import { formatHalalas, halalasToInput } from "@/lib/money";
import { deleteProviderService, setProviderServiceActive } from "@/app/actions/provider";
import { FormSubmit } from "@/components/form-submit";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ServiceForm, type ServiceOption } from "./service-form";

export const metadata: Metadata = { title: "خدماتي وأسعاري" };

export default async function ProviderServicesPage() {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);

  if (!provider) {
    return (
      <div>
        <PageTitle>خدماتي وأسعاري</PageTitle>
        <Card>
          <p>
            أكمل{" "}
            <Link href="/dashboard/provider/profile" className="text-primary hover:underline">
              ملف المكتب
            </Link>{" "}
            أولاً.
          </p>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [catalog, { data: services }] = await Promise.all([
    getServiceCatalog(),
    supabase
      .from("provider_services")
      .select(
        "id, service_type_id, fee_halalas, duration_days, notes, active, service_types(name_ar, min_fee_halalas, service_categories(name_ar))",
      )
      .eq("provider_id", provider.id)
      .order("created_at"),
  ]);

  const options: ServiceOption[] = catalog.flatMap((category) =>
    category.service_types.map((t) => ({
      id: t.id,
      name: t.name_ar,
      category: category.name_ar,
      minFee: t.min_fee_halalas,
      guideMin: t.guide_min_halalas,
      guideMax: t.guide_max_halalas,
    })),
  );
  const taken = new Set((services ?? []).map((s) => s.service_type_id));

  return (
    <div className="space-y-6">
      <PageTitle subtitle="السعر المعلن «يبدأ من» ويشمل أتعابك فقط، دون الرسوم الحكومية.">
        خدماتي وأسعاري
      </PageTitle>

      <Card>
        <h2 className="mb-4 font-semibold">إضافة خدمة</h2>
        {/* key يعيد تهيئة النموذج بعد كل إضافة ناجحة */}
        <ServiceForm key={taken.size} options={options.filter((o) => !taken.has(o.id))} />
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">خدماتي ({services?.length ?? 0})</h2>
        {!services?.length ? (
          <p className="text-sm text-muted">لم تضف خدمات بعد.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="my-services">
            {services.map((s) => {
              const option = options.find((o) => o.id === s.service_type_id);
              return (
                <li key={s.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.service_types?.name_ar}</p>
                      <p className="text-sm text-muted">
                        {s.service_types?.service_categories?.name_ar} · يبدأ من{" "}
                        {formatHalalas(s.fee_halalas)} · {s.duration_days} يوم
                      </p>
                      {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                    </div>
                    {s.active ? <Badge tone="success">ظاهرة</Badge> : <Badge>موقوفة</Badge>}
                    <form action={setProviderServiceActive}>
                      <input type="hidden" name="serviceId" value={s.id} />
                      <input type="hidden" name="active" value={String(!s.active)} />
                      <FormSubmit>{s.active ? "إيقاف" : "تفعيل"}</FormSubmit>
                    </form>
                    <form action={deleteProviderService}>
                      <input type="hidden" name="serviceId" value={s.id} />
                      <FormSubmit className="hover:border-danger hover:text-danger">حذف</FormSubmit>
                    </form>
                  </div>
                  {option && (
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">
                        تعديل السعر والمدة
                      </summary>
                      <div className="mt-3">
                        <ServiceForm
                          options={[option]}
                          serviceId={s.id}
                          initial={{
                            serviceTypeId: s.service_type_id,
                            fee: halalasToInput(s.fee_halalas),
                            durationDays: String(s.duration_days),
                            notes: s.notes ?? "",
                          }}
                        />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
