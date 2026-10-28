import type { Database } from "@/lib/supabase/database.types";

export type ProviderDocumentType = Database["public"]["Enums"]["provider_document_type"];
export type VerificationStatus = Database["public"]["Enums"]["provider_verification_status"];
export type DelegationPlatform = Database["public"]["Enums"]["delegation_platform"];

export const DOCUMENT_TYPES: { type: ProviderDocumentType; label: string }[] = [
  { type: "commercial_register", label: "السجل التجاري" },
  { type: "municipal_license", label: "الرخصة البلدية" },
  { type: "manager_id", label: "هوية المسؤول" },
  { type: "iban_certificate", label: "شهادة الحساب البنكي (IBAN)" },
];

export const DOCUMENT_LABEL = Object.fromEntries(
  DOCUMENT_TYPES.map((d) => [d.type, d.label]),
) as Record<ProviderDocumentType, string>;

export const ALLOWED_DOCUMENT_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const DOCUMENTS_BUCKET = "provider-documents";

export const DELEGATION_LABEL: Record<DelegationPlatform, string> = {
  qiwa: "قوى",
  balady: "بلدي",
  mc: "وزارة التجارة",
  none: "لا يتطلب تفويضاً عبر منصة",
};

/** الحالة كما يراها المزوّد والإدارة (تميّز المسودة عن الطلب المرسل) */
export type ProviderStage = "draft" | "under_review" | "approved" | "rejected" | "suspended";

export function providerStage(p: {
  verification_status: VerificationStatus;
  submitted_at: string | null;
}): ProviderStage {
  switch (p.verification_status) {
    case "pending":
      return p.submitted_at ? "under_review" : "draft";
    default:
      return p.verification_status;
  }
}

export const STAGE_LABEL: Record<ProviderStage, string> = {
  draft: "مسودة — لم يُرسل للتوثيق",
  under_review: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  suspended: "موقوف",
};

/** المزوّد يعدّل بيانات هويته ومستنداته فقط في هاتين الحالتين (مطابق لقاعدة البيانات) */
export function isEditableStage(stage: ProviderStage) {
  return stage === "draft" || stage === "rejected";
}
