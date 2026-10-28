import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "./constants";

/** ملف المزوّد للمستخدم الحالي (أو null إن لم يُنشئه بعد) */
export const getMyProvider = cache(async (profileId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("providers")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data;
});

/** كتالوج الخدمات الفعّال مرتّباً بالفئة */
export const getServiceCatalog = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_categories")
    .select(
      "id, slug, name_ar, sort_order, service_types(id, slug, name_ar, description, min_fee_halalas, guide_min_halalas, guide_max_halalas, required_docs, delegation_platform, sort_order)",
    )
    .order("sort_order")
    .order("sort_order", { referencedTable: "service_types" });
  return data ?? [];
});

export type ServiceCatalog = Awaited<ReturnType<typeof getServiceCatalog>>;

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * مستندات مزوّد مع روابط موقعة مؤقتة.
 * RLS في الجدول والتخزين يضمن أن المالك والإدارة فقط يحصلون على النتائج.
 */
export async function getProviderDocuments(providerId: string) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("provider_documents")
    .select("id, doc_type, storage_path, file_name, mime_type, size_bytes, uploaded_at")
    .eq("provider_id", providerId);
  if (!docs?.length) return [];

  const { data: signed } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(
    docs.map((d) => d.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return docs.map((d) => ({ ...d, url: urlByPath.get(d.storage_path) ?? null }));
}
