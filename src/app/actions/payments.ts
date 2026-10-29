"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getDb, serviceDb } from "@/lib/db/server";
import { getPaymentProvider } from "@/lib/payments";
import { MOCK_TEST_CARDS, MockGateway } from "@/lib/payments/mock-gateway";
import { handleWebhook } from "@/lib/payments/process";
import type { FormState } from "./auth";

/** أصل الموقع العام لروابط العودة من البوابة: APP_URL (نطاق الواجهة) إن حُدد، وإلا من الطلب */
async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** يبدأ الدفع: ينشئ جلسة في البوابة ويسجّل المحاولة ثم يحوّل العميل لصفحة البوابة */
export async function startPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const requestId = String(formData.get("requestId") ?? "");
  const db = await getDb();

  // القراءة بصلاحيات المستخدم (RLS): يضمن أنه عضو في حساب الطلب
  const order = await db.maybeOne<{
    id: string;
    total_paid_halalas: number;
    payment_status: string;
    request_status: string;
    service_name: string | null;
  }>(
    `select o.id, o.total_paid_halalas, o.payment_status,
            r.status as request_status, t.name_ar as service_name
     from public.orders o
     join public.service_requests r on r.id = o.request_id
     left join public.service_types t on t.id = r.service_type_id
     where o.request_id = $1`,
    [requestId],
  );
  if (!order || order.payment_status !== "unpaid" || order.request_status !== "awarded_unpaid") {
    return { message: "هذا الطلب غير متاح للدفع." };
  }

  const provider = getPaymentProvider();
  let redirectUrl: string;
  try {
    const session = await provider.createCheckout({
      orderId: order.id,
      amountHalalas: order.total_paid_halalas,
      description: `مُعقّب — ${order.service_name ?? "طلب خدمة"}`,
      callbackUrl: `${await appOrigin()}/api/payments/return?request=${requestId}`,
    });
    const { error } = await serviceDb().rpc("register_payment_attempt", {
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

  const payment = await serviceDb().maybeOne<{
    amount_halalas: number;
    status: string;
    request_id: string;
  }>(
    `select p.amount_halalas, p.status, o.request_id
     from public.payments p join public.orders o on o.id = p.order_id
     where p.gateway = 'mock' and p.provider_ref = $1`,
    [ref],
  );
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
  redirect(`/dashboard/requester/requests/${payment.request_id}?payment=return`);
}
