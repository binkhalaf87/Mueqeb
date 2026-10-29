import { verifyFileToken } from "@/lib/auth/token";
import { serviceDb } from "@/lib/db/server";
import { readObject } from "@/lib/storage";

/** تنزيل مستند خاص برابط موقّع مؤقت (يُصدر فقط بعد التحقق من صلاحية الوصول) */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const file = await verifyFileToken(token);
  if (!file) return new Response("الرابط غير صالح أو منتهٍ", { status: 403 });

  const meta = await serviceDb().maybeOne<{ mime_type: string | null }>(
    "select mime_type from storage.objects where bucket_id = $1 and name = $2",
    [file.bucket, file.path],
  );
  if (!meta) return new Response("غير موجود", { status: 404 });

  let body: Buffer;
  try {
    body = await readObject(file.bucket, file.path);
  } catch {
    return new Response("غير موجود", { status: 404 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": meta.mime_type ?? "application/octet-stream",
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
