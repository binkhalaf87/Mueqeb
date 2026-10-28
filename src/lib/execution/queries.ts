import "server-only";
import { createClient } from "@/lib/supabase/server";

export const REQUEST_DOCUMENTS_BUCKET = "request-documents";
const SIGNED_URL_TTL_SECONDS = 300;

/** مستندات الطلب بروابط موقعة مؤقتة — RLS يقصرها على العميل والمزوّد المُرسى عليه والإدارة */
export async function getRequestDocuments(requestId: string) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("request_documents")
    .select("id, kind, label, storage_path, file_name, created_at")
    .eq("request_id", requestId)
    .order("created_at");
  if (!docs?.length) return [];
  const { data: signed } = await supabase.storage.from(REQUEST_DOCUMENTS_BUCKET).createSignedUrls(
    docs.map((d) => d.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return docs.map((d) => ({ ...d, url: urlByPath.get(d.storage_path) ?? null }));
}

export type RequestDocument = Awaited<ReturnType<typeof getRequestDocuments>>[number];

/** رسائل خيط (طلب، مزوّد) — RLS يقصرها على أطراف الخيط */
export async function getThreadMessages(requestId: string, providerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, sender_role, body, was_masked, created_at")
    .eq("request_id", requestId)
    .eq("provider_id", providerId)
    .order("id");
  return data ?? [];
}

export type ChatMessage = Awaited<ReturnType<typeof getThreadMessages>>[number];
