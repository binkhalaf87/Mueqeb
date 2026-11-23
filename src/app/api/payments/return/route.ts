import { NextResponse, type NextRequest } from "next/server";
import { reconcilePendingPayment } from "@/lib/payments/process";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * عودة العميل من صفحة البوابة. لا نثق بمعاملات الرابط: نستعلم من البوابة مباشرة عن
 * آخر محاولة معلّقة (إن دعمت ذلك) ونطبّق النتيجة بنفس المسار idempotent،
 * ثم نعيد العميل لصفحة الطلب. الـ webhook يبقى المصدر الأساسي.
 */
export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("request") ?? "";
  if (!UUID.test(requestId)) {
    return redirectTo(request, "/dashboard/requester");
  }

  // عودة العميل: تحقق مباشر من البوابة (لا يرمي؛ الـ webhook يبقى المصدر الأساسي)
  await reconcilePendingPayment(requestId, 0);

  return redirectTo(request, `/dashboard/requester/requests/${requestId}?payment=return`);
}

/** على نطاق الواجهة العام (APP_URL) إن حُدد، وإلا نطاق الطلب نفسه */
function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, process.env.APP_URL || request.url));
}
