import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "./index";
import { WebhookVerificationError, type PaymentEvent } from "./types";

export type PaymentOutcome = "processed" | "duplicate" | "ignored" | "failed" | "refund_required";

/**
 * يطبّق حدث دفع موثّقاً على قاعدة البيانات (idempotent).
 * عند دفعة زائدة أو دفع بعد الإلغاء: تُسترد تلقائياً.
 */
export async function applyPaymentEvent(event: PaymentEvent): Promise<PaymentOutcome> {
  const provider = getPaymentProvider();
  const admin = createAdminClient();

  if (event.status === "refunded") {
    // استرداد بدأ من لوحة البوابة: يُسجَّل بقيد عكسي دون إلغاء الطلب تلقائياً
    const { data: payment } = await admin
      .from("payments")
      .select("id, amount_halalas, status")
      .eq("gateway", provider.name)
      .eq("provider_ref", event.providerRef)
      .maybeSingle();
    if (!payment || payment.status !== "paid") return "ignored";
    const { data, error } = await admin.rpc("record_refund", {
      p_payment_id: payment.id,
      p_refund_ref: event.eventId ?? event.gatewayPaymentId ?? "gateway",
      p_amount_halalas: payment.amount_halalas,
      p_raw: event.raw as never,
      p_cancel_request: false,
    });
    if (error) throw error;
    return data as PaymentOutcome;
  }

  const { data: outcome, error } = await admin.rpc("record_payment_result", {
    p_gateway: provider.name,
    // null مقصود: التحقق المباشر من البوابة ليس له معرّف حدث (الأنواع المولّدة لا تعبّر عن ذلك)
    p_event_id: event.eventId as string,
    p_provider_ref: event.providerRef,
    p_status: event.status,
    p_amount_halalas: event.amountHalalas,
    p_currency: event.currency,
    p_gateway_payment_id: event.gatewayPaymentId as string,
    p_raw: event.raw as never,
  });
  if (error) throw error;

  if (outcome === "refund_required") {
    const { data: payment } = await admin
      .from("payments")
      .select("id")
      .eq("gateway", provider.name)
      .eq("provider_ref", event.providerRef)
      .single();
    if (payment) await refundPayment(payment.id, { cancelRequest: false });
  }
  return outcome as PaymentOutcome;
}

/** يتحقق من webhook ويطبّقه. يُستخدم في مسار API وفي بوابة الاختبار المحلية. */
export async function handleWebhook(rawBody: string, headers: Headers) {
  try {
    const event = await getPaymentProvider().verifyWebhook(rawBody, headers);
    const outcome = await applyPaymentEvent(event);
    return { status: 200, body: { received: true, outcome } };
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return { status: 401, body: { error: "invalid signature" } };
    }
    console.error("payment webhook failed", err);
    // 500 يجعل البوابة تعيد المحاولة؛ المعالجة idempotent
    return { status: 500, body: { error: "processing failed" } };
  }
}

/**
 * استرداد كامل عبر البوابة ثم تسجيله بقيد عكسي (وإلغاء الطلب إن طُلب) في معاملة واحدة.
 * لا يُلغى الطلب إذا فشل الاسترداد في البوابة.
 */
export async function refundPayment(
  paymentId: string,
  opts: { cancelRequest: boolean; note?: string },
) {
  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from("payments")
    .select("id, provider_ref, gateway_payment_id, amount_halalas, status, refund_ref")
    .eq("id", paymentId)
    .single();
  if (error || !payment) throw error ?? new Error("payment not found");
  if (payment.status !== "paid") throw new Error(`payment is ${payment.status}`);

  const refund = await getPaymentProvider().refund({
    providerRef: payment.provider_ref,
    gatewayPaymentId: payment.gateway_payment_id,
    amountHalalas: payment.amount_halalas,
  });

  const { data, error: recordError } = await admin.rpc("record_refund", {
    p_payment_id: payment.id,
    p_refund_ref: refund.refundRef,
    p_amount_halalas: payment.amount_halalas,
    p_raw: refund.raw as never,
    p_cancel_request: opts.cancelRequest,
    p_note: opts.note,
  });
  if (recordError) throw recordError;
  return data;
}

/**
 * استرداد مبلغ (كامل أو جزئي) من البوابة للدفعة المعتمدة للطلب، ويعيد مرجع الاسترداد.
 * التسجيل في الدفتر يتم بعدها بدالة التسوية المناسبة في قاعدة البيانات.
 */
export async function refundAtGateway(orderId: string, amountHalalas: number) {
  if (amountHalalas <= 0) return null;
  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from("payments")
    .select("provider_ref, gateway_payment_id")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .order("paid_at")
    .limit(1)
    .single();
  if (error || !payment) throw error ?? new Error("paid payment not found");
  const refund = await getPaymentProvider().refund({
    providerRef: payment.provider_ref,
    gatewayPaymentId: payment.gateway_payment_id,
    amountHalalas,
  });
  return refund.refundRef;
}
