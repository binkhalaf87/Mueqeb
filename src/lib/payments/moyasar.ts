import { timingSafeEqual } from "node:crypto";
import {
  WebhookVerificationError,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  type RefundResult,
} from "./types";

/**
 * Moyasar (بوابة سعودية) — وضع الاختبار فقط.
 * - الدفع عبر فاتورة مستضافة (Invoices API): بيانات البطاقة لا تمر بخوادمنا.
 * - Moyasar توقّع أحداث webhook برمز سري مشترك (secret_token) داخل الحمولة؛
 *   نقارنه بزمن ثابت، ثم يُطبّق الدفع بعد مطابقة المبلغ في قاعدة البيانات.
 * - يرفض أي مفتاح ليس sk_test_.
 */

const API = "https://api.moyasar.com/v1";

type MoyasarPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  invoice_id?: string | null;
  source?: { message?: string } | null;
};

type MoyasarWebhook = {
  id: string;
  type: string;
  secret_token?: string;
  live?: boolean;
  data: MoyasarPayment;
};

const STATUS: Record<string, PaymentEvent["status"] | undefined> = {
  payment_paid: "paid",
  payment_failed: "failed",
  payment_refunded: "refunded",
};

export class MoyasarGateway implements PaymentProvider {
  readonly name = "moyasar" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!secretKey?.startsWith("sk_test_")) {
      throw new Error("وضع الاختبار فقط: MOYASAR_SECRET_KEY يجب أن يبدأ بـ sk_test_");
    }
    if (!webhookSecret || webhookSecret.length < 16) {
      throw new Error("MOYASAR_WEBHOOK_SECRET مطلوب (16 حرفاً على الأقل)");
    }
  }

  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Moyasar ${path} → ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const invoice = await this.call<{ id: string; url: string }>("/invoices", {
      method: "POST",
      body: {
        amount: input.amountHalalas,
        currency: "SAR",
        description: input.description,
        callback_url: input.callbackUrl,
        metadata: { order_id: input.orderId },
      },
    });
    return { providerRef: invoice.id, redirectUrl: invoice.url };
  }

  // Moyasar لا تضع التوقيع في الترويسات بل secret_token داخل الحمولة
  async verifyWebhook(rawBody: string, _headers?: Headers): Promise<PaymentEvent> {
    void _headers;
    let payload: MoyasarWebhook;
    try {
      payload = JSON.parse(rawBody) as MoyasarWebhook;
    } catch {
      throw new WebhookVerificationError("invalid json");
    }
    const a = Buffer.from(payload.secret_token ?? "");
    const b = Buffer.from(this.webhookSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookVerificationError("invalid secret token");
    }
    if (payload.live) {
      throw new WebhookVerificationError("live events are not accepted in test mode");
    }
    const status = STATUS[payload.type];
    if (!status) {
      throw new WebhookVerificationError(`unsupported event ${payload.type}`);
    }
    return this.toEvent(payload.id, payload.data, status, payload);
  }

  async fetchPayment(providerRef: string): Promise<PaymentEvent | null> {
    const invoice = await this.call<{ id: string; status: string; payments?: MoyasarPayment[] }>(
      `/invoices/${encodeURIComponent(providerRef)}`,
    );
    const payment =
      invoice.payments?.find((p) => p.status === "paid") ?? invoice.payments?.at(-1) ?? null;
    if (!payment) return null;
    const status =
      payment.status === "paid" ? "paid" : payment.status === "failed" ? "failed" : null;
    if (!status) return null;
    return this.toEvent(null, { ...payment, invoice_id: invoice.id }, status, invoice);
  }

  async refund(payment: {
    providerRef: string;
    gatewayPaymentId: string | null;
    amountHalalas: number;
  }): Promise<RefundResult> {
    if (!payment.gatewayPaymentId) throw new Error("gateway payment id is required for refund");
    const result = await this.call<MoyasarPayment>(
      `/payments/${encodeURIComponent(payment.gatewayPaymentId)}/refund`,
      { method: "POST", body: { amount: payment.amountHalalas } },
    );
    if (result.status !== "refunded") {
      throw new Error(`Moyasar refund status ${result.status}`);
    }
    return { refundRef: result.id, raw: result };
  }

  private toEvent(
    eventId: string | null,
    data: MoyasarPayment,
    status: PaymentEvent["status"],
    raw: unknown,
  ): PaymentEvent {
    return {
      eventId,
      providerRef: data.invoice_id ?? data.id,
      gatewayPaymentId: data.id,
      status,
      amountHalalas: data.amount,
      currency: data.currency,
      raw,
    };
  }
}
