import { NextResponse, type NextRequest } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { applyPaymentEvent } from "@/lib/payments/process";
import { serviceDb } from "@/lib/db/server";

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

  try {
    // آخر محاولة دفع لم تُحسم بعد لهذا الطلب
    const provider = getPaymentProvider();
    const pending = await serviceDb().maybeOne<{ provider_ref: string }>(
      `select p.provider_ref
       from public.payments p join public.orders o on o.id = p.order_id
       where o.request_id = $1 and p.status = 'initiated'
       order by p.created_at desc limit 1`,
      [requestId],
    );
    if (pending) {
      const event = await provider.fetchPayment(pending.provider_ref);
      if (event) await applyPaymentEvent(event);
    }
  } catch (err) {
    console.error("payment return verification failed", err);
  }

  return redirectTo(request, `/dashboard/requester/requests/${requestId}?payment=return`);
}

/** على نطاق الواجهة العام (APP_URL) إن حُدد، وإلا نطاق الطلب نفسه */
function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, process.env.APP_URL || request.url));
}
