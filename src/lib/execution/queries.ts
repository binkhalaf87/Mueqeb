import "server-only";
import { getDb } from "@/lib/db/server";
import { createSignedUrls } from "@/lib/storage";
import type { Tables } from "@/lib/db/types";

export const REQUEST_DOCUMENTS_BUCKET = "request-documents";
const SIGNED_URL_TTL_SECONDS = 300;

/** مستندات الطلب بروابط موقعة مؤقتة — RLS يقصرها على العميل والمزوّد المُرسى عليه والإدارة */
export async function getRequestDocuments(requestId: string) {
  const db = await getDb();
  const docs = await db.query<
    Pick<
      Tables<"request_documents">,
      "id" | "kind" | "label" | "storage_path" | "file_name" | "created_at"
    >
  >(
    `select id, kind, label, storage_path, file_name, created_at
     from public.request_documents where request_id = $1 order by created_at`,
    [requestId],
  );
  if (!docs.length) return [];
  const urls = await createSignedUrls(
    db,
    REQUEST_DOCUMENTS_BUCKET,
    docs.map((d) => d.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );
  return docs.map((d) => ({ ...d, url: urls.get(d.storage_path) ?? null }));
}

export type RequestDocument = Awaited<ReturnType<typeof getRequestDocuments>>[number];

/** رسالة كما تصل للواجهة: بلا معرّف المرسل (mine تُحسب في الخادم فلا يُكشف معرّف الطرف الآخر) */
export type ChatMessage = Pick<
  Tables<"messages">,
  "id" | "sender_role" | "body" | "was_masked" | "created_at"
> & { mine: boolean };

/** رسائل خيط (طلب، مزوّد) بعد معرّف معيّن — RLS يقصرها على أطراف الخيط */
export async function getThreadMessages(requestId: string, providerId: string, afterId = 0) {
  const db = await getDb();
  return db.query<ChatMessage>(
    `select id, sender_role, body, was_masked, created_at, sender_id = auth.uid() as mine
     from public.messages
     where request_id = $1 and provider_id = $2 and id > $3
     order by id`,
    [requestId, providerId, afterId],
  );
}
