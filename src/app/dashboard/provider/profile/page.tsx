import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getMyProvider, getProviderDocuments } from "@/lib/providers/queries";
import { DOCUMENT_TYPES, isEditableStage, providerStage } from "@/lib/providers/constants";
import { ProviderStageBadge } from "@/components/provider-stage-badge";
import { Card, PageTitle } from "@/components/ui";
import { ProfileForm } from "./profile-form";
import { DocumentUpload } from "./document-upload";
import { SubmitForReview } from "./submit-for-review";

export const metadata: Metadata = { title: "ملف المكتب" };

export default async function ProviderProfilePage() {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  const stage = provider ? providerStage(provider) : "draft";
  const editable = isEditableStage(stage);
  const documents = provider ? await getProviderDocuments(provider.id) : [];
  const docByType = new Map(documents.map((d) => [d.doc_type, d]));

  return (
    <div className="space-y-6">
      <PageTitle subtitle="هذه البيانات تراجعها الإدارة قبل اعتماد مكتبك.">
        <span className="flex flex-wrap items-center gap-3">
          ملف المكتب <ProviderStageBadge stage={stage} />
        </span>
      </PageTitle>

      {provider?.rejection_reason && (stage === "rejected" || stage === "suspended") && (
        <Card className="border-red-300">
          <p className="text-sm">
            <span className="font-semibold">
              {stage === "rejected" ? "سبب الرفض: " : "سبب الإيقاف: "}
            </span>
            {provider.rejection_reason}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 font-semibold">بيانات المكتب</h2>
        <ProfileForm
          identityEditable={editable}
          initial={
            provider
              ? {
                  officeName: provider.office_name,
                  crNumber: provider.cr_number,
                  municipalLicenseNumber: provider.municipal_license_number,
                  cities: provider.cities,
                  bio: provider.bio ?? "",
                }
              : undefined
          }
        />
      </Card>

      <Card id="documents">
        <h2 className="mb-1 font-semibold">المستندات</h2>
        <p className="mb-4 text-sm text-muted">
          PDF أو JPG أو PNG، بحد أقصى 5 ميجابايت للملف. لا يطّلع عليها إلا أنت والإدارة.
        </p>
        {provider ? (
          <div className="divide-y divide-border">
            {DOCUMENT_TYPES.map(({ type, label }) => {
              const doc = docByType.get(type);
              return (
                <DocumentUpload
                  key={type}
                  docType={type}
                  label={label}
                  editable={editable}
                  current={doc ? { fileName: doc.file_name, url: doc.url } : null}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">احفظ بيانات المكتب أولاً لتتمكن من رفع المستندات.</p>
        )}
      </Card>

      {provider && editable && (
        <Card id="submit">
          <h2 className="mb-1 font-semibold">الإرسال للتوثيق</h2>
          <p className="mb-4 text-sm text-muted">
            بعد الإرسال لا يمكن تعديل بيانات الهوية أو المستندات حتى تنتهي المراجعة.
          </p>
          <SubmitForReview ready={documents.length >= 4 && provider.cities.length > 0} />
        </Card>
      )}
    </div>
  );
}
