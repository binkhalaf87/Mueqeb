/**
 * تخزين المستندات الخاصة على قرص الخادم (Volume في Railway) دون أي رابط عام.
 *
 * صلاحية الوصول تحكمها سياسات RLS على storage.objects (بهوية المنفّذ):
 *   - الرفع: إدراج صف storage.objects يمر بسياسة insert ثم يُكتب الملف (في نفس المعاملة)
 *   - القراءة: لا يصدر رابط موقّع إلا إن كان الصف مرئياً للمنفّذ
 *   - الحذف: يُحذف الصف بسياسة delete ثم الملف
 * الروابط موقّعة ومؤقتة وتمر عبر /api/files/<token>.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/lib/db/core";
import { signFileToken } from "@/lib/auth/token";

const BUCKET_ID = /^[a-z0-9-]+$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

function storageRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? ".data/storage");
}

/** مسار آمن على القرص: يرفض أي مقطع غير مألوف ("..", شرطات مائلة عكسية، إلخ) */
function filePath(bucket: string, objectPath: string) {
  const segments = objectPath.split("/");
  if (!BUCKET_ID.test(bucket) || !segments.every((s) => SEGMENT.test(s) && s !== "..")) {
    throw new Error("مسار ملف غير صالح");
  }
  return path.join(/*turbopackIgnore: true*/ storageRoot(), bucket, ...segments);
}

export type UploadError = "forbidden" | "too_large" | "bad_type" | "exists";

export async function uploadObject(
  db: Db,
  bucket: string,
  objectPath: string,
  file: Blob,
): Promise<{ error: UploadError | null }> {
  const target = filePath(bucket, objectPath);
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await db.transaction(async (tx) => {
      const limits = await tx.maybeOne<{
        file_size_limit: number | null;
        allowed_mime_types: string[] | null;
      }>("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
      if (!limits) throw new UploadFailure("forbidden");
      if (limits.file_size_limit && bytes.length > limits.file_size_limit) {
        throw new UploadFailure("too_large");
      }
      if (limits.allowed_mime_types && !limits.allowed_mime_types.includes(file.type)) {
        throw new UploadFailure("bad_type");
      }
      await tx.query(
        `insert into storage.objects (bucket_id, name, mime_type, size_bytes)
         values ($1, $2, $3, $4)`,
        [bucket, objectPath, file.type, bytes.length],
      );
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    });
    return { error: null };
  } catch (error) {
    if (error instanceof UploadFailure) return { error: error.reason };
    const code = (error as { code?: string }).code;
    if (code === "42501") return { error: "forbidden" };
    if (code === "23505" || code === "EEXIST") return { error: "exists" };
    throw error;
  }
}

class UploadFailure extends Error {
  constructor(readonly reason: UploadError) {
    super(reason);
  }
}

/** يحذف ما تسمح به سياسة delete للمنفّذ فقط */
export async function removeObjects(db: Db, bucket: string, paths: string[]) {
  if (!paths.length) return;
  const removed = await db.query<{ name: string }>(
    "delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name",
    [bucket, paths],
  );
  await Promise.all(removed.map((r) => rm(filePath(bucket, r.name), { force: true })));
}

/** روابط موقّعة مؤقتة للملفات المرئية للمنفّذ فقط (غير المرئي لا يحصل على رابط) */
export async function createSignedUrls(
  db: Db,
  bucket: string,
  paths: string[],
  ttlSeconds: number,
): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const visible = await db.query<{ name: string }>(
    "select name from storage.objects where bucket_id = $1 and name = any($2::text[])",
    [bucket, paths],
  );
  const entries = await Promise.all(
    visible.map(async (r) => {
      const token = await signFileToken(bucket, r.name, ttlSeconds);
      return [r.name, `/api/files/${token}`] as const;
    }),
  );
  return new Map(entries);
}

/** قراءة الملف بعد التحقق من الرمز (يستدعيه مسار التنزيل فقط) */
export async function readObject(bucket: string, objectPath: string) {
  return readFile(filePath(bucket, objectPath));
}
