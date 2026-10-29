import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { createSignedUrls } from "@/lib/storage";
import { DOCUMENTS_BUCKET } from "./constants";

/** ملف المزوّد للمستخدم الحالي (أو null إن لم يُنشئه بعد) */
export const getMyProvider = cache(async (profileId: string) => {
  const db = await getDb();
  return db.maybeOne<Tables<"providers">>("select * from public.providers where profile_id = $1", [
    profileId,
  ]);
});

type CatalogServiceType = Pick<
  Tables<"service_types">,
  | "id"
  | "slug"
  | "name_ar"
  | "description"
  | "min_fee_halalas"
  | "guide_min_halalas"
  | "guide_max_halalas"
  | "required_docs"
  | "delegation_platform"
  | "sort_order"
>;

/** كتالوج الخدمات الفعّال مرتّباً بالفئة (RLS يُظهر الأنواع الفعّالة فقط لغير الإدارة) */
export const getServiceCatalog = cache(async () => {
  const db = await getDb();
  return db.query<
    Pick<Tables<"service_categories">, "id" | "slug" | "name_ar" | "sort_order"> & {
      service_types: CatalogServiceType[];
    }
  >(
    `select c.id, c.slug, c.name_ar, c.sort_order,
            coalesce((
              select json_agg(json_build_object(
                       'id', t.id, 'slug', t.slug, 'name_ar', t.name_ar, 'description', t.description,
                       'min_fee_halalas', t.min_fee_halalas, 'guide_min_halalas', t.guide_min_halalas,
                       'guide_max_halalas', t.guide_max_halalas, 'required_docs', t.required_docs,
                       'delegation_platform', t.delegation_platform, 'sort_order', t.sort_order)
                     order by t.sort_order)
              from public.service_types t where t.category_id = c.id
            ), '[]') as service_types
     from public.service_categories c
     order by c.sort_order`,
  );
});

export type ServiceCatalog = Awaited<ReturnType<typeof getServiceCatalog>>;

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * مستندات مزوّد مع روابط موقعة مؤقتة.
 * RLS في الجدول وفي storage.objects يضمن أن المالك والإدارة فقط يحصلون على النتائج.
 */
export async function getProviderDocuments(providerId: string) {
  const db = await getDb();
  const docs = await db.query<
    Pick<
      Tables<"provider_documents">,
      "id" | "doc_type" | "storage_path" | "file_name" | "mime_type" | "size_bytes" | "uploaded_at"
    >
  >(
    `select id, doc_type, storage_path, file_name, mime_type, size_bytes, uploaded_at
     from public.provider_documents where provider_id = $1`,
    [providerId],
  );
  if (!docs.length) return [];

  const urls = await createSignedUrls(
    db,
    DOCUMENTS_BUCKET,
    docs.map((d) => d.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );
  return docs.map((d) => ({ ...d, url: urls.get(d.storage_path) ?? null }));
}
