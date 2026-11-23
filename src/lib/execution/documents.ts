import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/core";
import { attempt } from "@/lib/db/core";
import type { Enums } from "@/lib/db/types";
import { REQUEST_DOCUMENTS_BUCKET } from "@/lib/execution/queries";
import { ALLOWED_DOCUMENT_MIME } from "@/lib/providers/constants";
import { removeObjects, uploadObject } from "@/lib/storage";

/**
 * يحفظ مستنداً للطلب: الملف في التخزين الخاص ثم صفه في request_documents.
 * RLS في storage.objects والجدول يتحقق من الدور وحالة الطلب ونوع المستند.
 * الملف يجب أن يكون قد مرّ بـ validateDocumentFile.
 */
export async function saveRequestDocument(
  db: Db,
  input: {
    requestId: string;
    kind: Enums<"request_document_kind">;
    label: string;
    file: File;
    userId: string;
  },
): Promise<"upload_failed" | "save_failed" | null> {
  const { requestId, kind, label, file, userId } = input;
  const ext = ALLOWED_DOCUMENT_MIME[file.type as keyof typeof ALLOWED_DOCUMENT_MIME];
  const path = `${requestId}/${kind}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await uploadObject(db, REQUEST_DOCUMENTS_BUCKET, path, file);
  if (uploadError) return "upload_failed";

  const { error } = await attempt(
    db.query(
      `insert into public.request_documents
         (request_id, kind, label, storage_path, file_name, mime_type, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        requestId,
        kind,
        label.slice(0, 120) || "مستند",
        path,
        file.name.slice(0, 200) || `document.${ext}`,
        file.type,
        file.size,
        userId,
      ],
    ),
  );
  if (error) {
    await removeObjects(db, REQUEST_DOCUMENTS_BUCKET, [path]);
    return "save_failed";
  }
  return null;
}
