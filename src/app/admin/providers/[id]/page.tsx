import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProviderDocuments } from "@/lib/providers/queries";
import { DOCUMENT_TYPES, providerStage } from "@/lib/providers/constants";
import { formatHalalas } from "@/lib/money";
import { ProviderStageBadge } from "@/components/provider-stage-badge";
import { Card, PageTitle } from "@/components/ui";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "مراجعة مزوّد" };

export default async function AdminProviderPage({ params }: PageProps<"/admin/providers/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  const supabase = await createClient();

  const { data: provider } = await supabase
    .from("providers")
    .select("*, profiles!providers_profile_id_fkey(full_name, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!provider) notFound();

  const [documents, { data: services }] = await Promise.all([
    getProviderDocuments(provider.id),
    supabase
      .from("provider_services")
      .select("id, fee_halalas, duration_days, active, service_types(name_ar)")
      .eq("provider_id", provider.id),
  ]);
  const docByType = new Map(documents.map((d) => [d.doc_type, d]));
  const stage = providerStage(provider);

  return (
    <div className="space-y-6">
      <Link href="/admin/providers" className="text-sm text-primary hover:underline">
        → طابور التوثيق
      </Link>
      <PageTitle>
        <span className="flex flex-wrap items-center gap-3">
          {provider.office_name} <ProviderStageBadge stage={stage} />
        </span>
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-3 font-semibold">بيانات المكتب</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="المسؤول">{provider.profiles?.full_name}</Row>
              <Row label="الجوال">
                <span dir="ltr">{provider.profiles?.phone ?? "—"}</span>
              </Row>
              <Row label="السجل التجاري">
                <span dir="ltr">{provider.cr_number}</span>
              </Row>
              <Row label="الرخصة البلدية">
                <span dir="ltr">{provider.municipal_license_number}</span>
              </Row>
              <Row label="المدن">{provider.cities.join("، ") || "—"}</Row>
              <Row label="تاريخ الإرسال">
                {provider.submitted_at
                  ? new Date(provider.submitted_at).toLocaleString("ar-SA-u-nu-latn")
                  : "لم يُرسل"}
              </Row>
            </dl>
            {provider.bio && <p className="mt-3 text-sm">{provider.bio}</p>}
            {provider.rejection_reason && (
              <p className="mt-3 text-sm">
                <span className="font-medium">آخر سبب رفض/إيقاف: </span>
                {provider.rejection_reason}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold">المستندات</h2>
            <p className="mb-3 text-xs text-muted">الروابط موقّعة وصالحة لخمس دقائق.</p>
            <ul className="divide-y divide-border text-sm" data-testid="admin-documents">
              {DOCUMENT_TYPES.map(({ type, label }) => {
                const doc = docByType.get(type);
                return (
                  <li key={type} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="font-medium">{label}</span>
                    {doc?.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {doc.file_name}
                      </a>
                    ) : (
                      <span className="text-danger">غير مرفوع</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">الخدمات ({services?.length ?? 0})</h2>
            <ul className="space-y-1 text-sm">
              {(services ?? []).map((s) => (
                <li key={s.id}>
                  {s.service_types?.name_ar} — {formatHalalas(s.fee_halalas)} · {s.duration_days}{" "}
                  يوم {!s.active && <span className="text-muted">(موقوفة)</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">الإجراء</h2>
          <ReviewActions providerId={provider.id} stage={stage} />
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
