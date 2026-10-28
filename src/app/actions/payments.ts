"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments";
import { MOCK_TEST_CARDS, MockGateway } from "@/lib/payments/mock-gateway";
import { handleWebhook } from "@/lib/payments/process";
import type { FormState } from "./auth";

async function appOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** يبدأ الدفع: ينشئ جلسة في البوابة ويسجّل المحاولة ثم يحوّل العميل لصفحة البوابة */
export async function startPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const requestId = String(formData.get("requestId") ?? "");
  const supabase = await createClient();

  // القراءة بصلاحيات المستخدم (RLS): يضمن أنه عضو في حساب الطلب
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, total_paid_halalas, payment_status, service_requests(status, service_types(name_ar))",
    )
    .eq("request_id", requestId)
    .maybeSingle();
  if (
    !order ||
    order.payment_status !== "unpaid" ||
    order.service_requests?.status !== "awarded_unpaid"
  ) {
    return { message: "هذا الطلب غير متاح للدفع." };
  }

  const provider = getPaymentProvider();
  let redirectUrl: string;
  try {
    const session = await provider.createCheckout({
      orderId: order.id,
      amountHalalas: order.total_paid_halalas,
      description: `مُعقّب — ${order.service_requests?.service_types?.name_ar ?? "طلب خدمة"}`,
      callbackUrl: `${await appOrigin()}/api/payments/return?request=${requestId}`,
    });
    const { error } = await createAdminClient().rpc("register_payment_attempt", {
      p_order_id: order.id,
      p_gateway: provider.name,
      p_provider_ref: session.providerRef,
      p_amount_halalas: order.total_paid_halalas,
    });
    if (error) throw error;
    redirectUrl = session.redirectUrl;
  } catch (err) {
    console.error("start payment failed", err);
    return { message: "تعذّر بدء الدفع، حاول مرة أخرى." };
  }
  redirect(redirectUrl);
}

/**
 * بوابة الاختبار المحلية: «الدفع» من صفحتها المستضافة.
 * ترسل حدثاً موقّعاً إلى معالج الـ webhook نفسه ثم تعيد العميل لمسار العودة.
 */
export async function payWithTestCard(_prev: FormState, formData: FormData): Promise<FormState> {
  const provider = getPaymentProvider();
  if (!(provider instanceof MockGateway)) return { message: "بوابة الاختبار غير مفعّلة." };

  const ref = String(formData.get("ref") ?? "");
  const card = String(formData.get("card") ?? "").replace(/\s+/g, "");
  if (card !== MOCK_TEST_CARDS.success && card !== MOCK_TEST_CARDS.declined) {
    return {
      errors: {
        card: "استخدم بطاقة اختبار: 4111 1111 1111 1111 (ناجحة) أو 4000 0000 0000 0002 (مرفوضة)",
      },
    };
  }

  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("amount_halalas, status, orders(request_id)")
    .eq("gateway", "mock")
    .eq("provider_ref", ref)
    .maybeSingle();
  if (!payment || payment.status !== "initiated")
    return { message: "جلسة الدفع غير صالحة أو منتهية." };

  const outcome = card === MOCK_TEST_CARDS.success ? "paid" : "failed";
  const { rawBody, headers: signed } = provider.buildSignedEvent(
    ref,
    payment.amount_halalas,
    outcome,
  );
  const result = await handleWebhook(rawBody, signed);
  if (result.status !== 200) return { message: "تعذّر إتمام الدفع التجريبي." };

  // الحدث الموقّع طُبّق أعلاه؛ البوابات الحقيقية تعيد المتصفح لمسار /api/payments/return
  redirect(`/dashboard/requester/requests/${payment.orders?.request_id ?? ""}?payment=return`);
}
