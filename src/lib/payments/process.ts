import "server-only";
import { serviceDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { getPaymentProvider } from "./index";
import { IgnoredWebhookEvent, WebhookVerificationError, type PaymentEvent } from "./types";
import { logError } from "@/lib/log";

export type PaymentOutcome = "processed" | "duplicate" | "ignored" | "failed" | "refund_required";

/**
 * يطبّق حدث دفع موثّقاً على قاعدة البيانات (idempotent).
 * عند دفعة زائدة أو دفع بعد الإلغاء: تُسترد تلقائياً.
 */
export async function applyPaymentEvent(event: PaymentEvent): Promise<PaymentOutcome> {
  const provider = getPaymentProvider();
  const admin = serviceDb();

  if (event.status === "refunded") {
    // استرداد بدأ من لوحة البوابة: يُسجَّل بقيد عكسي دون إلغاء الطلب تلقائياً
    const payment = await admin.maybeOne<
      Pick<Tables<"payments">, "id" | "amount_halalas" | "status">
    >(
      "select id, amount_halalas, status from public.payments where gateway = $1 and provider_ref = $2",
      [provider.name, event.providerRef],
    );
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
    // null مقصود: التحقق المباشر من البوابة ليس له معرّف حدث
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
    const payment = await admin.maybeOne<{ id: string }>(
      "select id from public.payments where gateway = $1 and provider_ref = $2",
      [provider.name, event.providerRef],
    );
    if (payment) await refundPayment(payment.id, { cancelRequest: false });
  }
  return outcome as PaymentOutcome;
}

/** يتحقق من webhook ويطبّقه. يُستخدم في مسار API وفي بوابة الاختبار المحلية. */
export async function handleWebhook(rawBody: string, headers: Headers, url?: URL) {
  try {
    const event = await getPaymentProvider().verifyWebhook(rawBody, headers, url);
    const outcome = await applyPaymentEvent(event);
    return { status: 200, body: { received: true, outcome } };
  } catch (err) {
    if (err instanceof IgnoredWebhookEvent) {
      return { status: 200, body: { received: true, outcome: "ignored" } };
    }
    if (err instanceof WebhookVerificationError) {
      return { status: 401, body: { error: "invalid signature" } };
    }
    logError("payment webhook", err);
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
  const admin = serviceDb();
  const payment = await admin.maybeOne<
    Pick<
      Tables<"payments">,
      "id" | "provider_ref" | "gateway_payment_id" | "amount_halalas" | "status" | "refund_ref"
    >
  >(
    `select id, provider_ref, gateway_payment_id, amount_halalas, status, refund_ref
     from public.payments where id = $1`,
    [paymentId],
  );
  if (!payment) throw new Error("payment not found");
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
  const payment = await serviceDb().maybeOne<
    Pick<Tables<"payments">, "provider_ref" | "gateway_payment_id">
  >(
    `select provider_ref, gateway_payment_id from public.payments
     where order_id = $1 and status = 'paid' order by paid_at limit 1`,
    [orderId],
  );
  if (!payment) throw new Error("paid payment not found");
  const refund = await getPaymentProvider().refund({
    providerRef: payment.provider_ref,
    gatewayPaymentId: payment.gateway_payment_id,
    amountHalalas,
  });
  return refund.refundRef;
}

// ============ الاستعلام الاحتياطي عن الدفع (حين لا يصل إشعار البوابة) ============

type PendingAttempt = { provider_ref: string; gateway_intention_id: string | null };

/** آخر فحص لكل محاولة: يحدّ الاستعلام من البوابة إلى مرة كل 30 ثانية لكل محاولة */
const lastChecked = new Map<string, number>();
const CHECK_INTERVAL_MS = 30_000;

async function checkAttempt(attempt: PendingAttempt): Promise<PaymentOutcome | null> {
  const now = Date.now();
  if (now - (lastChecked.get(attempt.provider_ref) ?? 0) < CHECK_INTERVAL_MS) return null;
  lastChecked.set(attempt.provider_ref, now);
  if (lastChecked.size > 1000) lastChecked.clear();

  const provider = getPaymentProvider();
  const event = await provider.fetchPayment(attempt.provider_ref, attempt.gateway_intention_id);
  return event ? applyPaymentEvent(event) : null;
}

/**
 * يتحقق من البوابة مباشرة من آخر محاولة دفع غير محسومة لطلب (عند فتح صفحة الطلب أو الدفع
 * أو عودة العميل من البوابة). لا يرمي أبداً: فشله يُسجَّل فقط ولا يُسقط الصفحة.
 */
export async function reconcilePendingPayment(
  requestId: string,
  /** عند فتح الصفحات ننتظر قليلاً بعد بدء المحاولة؛ عند العودة من البوابة نتحقق فوراً */
  minAgeSeconds = 20,
): Promise<PaymentOutcome | null> {
  try {
    const attempt = await serviceDb().maybeOne<PendingAttempt>(
      `select p.provider_ref, p.gateway_intention_id
       from public.payments p join public.orders o on o.id = p.order_id
       where o.request_id = $1 and p.status = 'initiated'
         and p.created_at <= now() - make_interval(secs => $2)
         and p.created_at > now() - interval '48 hours'
       order by p.created_at desc limit 1`,
      [requestId, minAgeSeconds],
    );
    return attempt ? await checkAttempt(attempt) : null;
  } catch (err) {
    logError("payment reconcile (request)", err);
    return null;
  }
}

const sweepState = globalThis as unknown as { __mueqebPaymentSweepAt?: number };
const SWEEP_INTERVAL_MS = 5 * 60_000;

/** من المُجدول: محاولات معلّقة (بين دقيقتين و48 ساعة) كل 5 دقائق، 20 كحد أقصى لكل مرة */
export async function reconcileStalePayments(now = Date.now()) {
  if (now - (sweepState.__mueqebPaymentSweepAt ?? 0) < SWEEP_INTERVAL_MS) return 0;
  sweepState.__mueqebPaymentSweepAt = now;
  const attempts = await serviceDb().query<PendingAttempt>(
    `select provider_ref, gateway_intention_id from public.payments
     where status = 'initiated'
       and created_at < now() - interval '2 minutes'
       and created_at > now() - interval '48 hours'
     order by created_at desc limit 20`,
  );
  let settled = 0;
  for (const attempt of attempts) {
    try {
      if (await checkAttempt(attempt)) settled += 1;
    } catch (err) {
      logError("payment reconcile (sweep)", err);
    }
  }
  return settled;
}
