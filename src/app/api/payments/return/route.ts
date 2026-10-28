import { NextResponse, type NextRequest } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { applyPaymentEvent } from "@/lib/payments/process";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * عودة العميل من صفحة البوابة. لا نثق بمعاملات الرابط: نستعلم من البوابة مباشرة عن
 * آخر محاولة معلّقة (إن دعمت ذلك) ونطبّق النتيجة بنفس المسار idempotent،
 * ثم نعيد العميل لصفحة الطلب. الـ webhook يبقى المصدر الأساسي.
 */
export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("request") ?? "";
  if (!UUID.test(requestId)) {
    return NextResponse.redirect(new URL("/dashboard/requester", request.url));
  }
  const target = new URL(`/dashboard/requester/requests/${requestId}`, request.url);

  try {
    // آخر محاولة دفع لم تُحسم بعد لهذا الطلب
    const provider = getPaymentProvider();
    const { data: order } = await createAdminClient()
      .from("orders")
      .select("payments(provider_ref, status, created_at)")
      .eq("request_id", requestId)
      .maybeSingle();
    const pending = (order?.payments ?? [])
      .filter((p) => p.status === "initiated")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (pending) {
      const event = await provider.fetchPayment(pending.provider_ref);
      if (event) await applyPaymentEvent(event);
    }
  } catch (err) {
    console.error("payment return verification failed", err);
  }

  target.searchParams.set("payment", "return");
  return NextResponse.redirect(target);
}
