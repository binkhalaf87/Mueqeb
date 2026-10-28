import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  WebhookVerificationError,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  type RefundResult,
} from "./types";

/**
 * بوابة اختبار محلية (وضع الاختبار فقط) تحاكي بوابة مستضافة:
 * صفحة دفع خارج تدفق التطبيق، وأحداث webhook موقّعة بـ HMAC-SHA256.
 * تُستخدم للتطوير المحلي والاختبارات الآلية عند غياب مفاتيح Moyasar.
 */

export const MOCK_TEST_CARDS = {
  success: "4111111111111111",
  declined: "4000000000000002",
} as const;

const SIGNATURE_HEADER = "x-mock-signature";
const TOLERANCE_SECONDS = 300;

export function signMockPayload(secret: string, rawBody: string, timestamp: number) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export type MockWebhookPayload = {
  id: string;
  type: "payment_paid" | "payment_failed";
  data: {
    id: string;
    status: "paid" | "failed";
    amount: number;
    currency: "SAR";
    message?: string;
  };
};

export class MockGateway implements PaymentProvider {
  readonly name = "mock" as const;

  constructor(private readonly webhookSecret: string) {
    if (!webhookSecret || webhookSecret.length < 16) {
      throw new Error("MOCK_PAYMENT_WEBHOOK_SECRET مطلوب (16 حرفاً على الأقل)");
    }
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    // صفحة الدفع التجريبية تعيد العميل لمسار العودة نفسه المستخدم مع البوابات الحقيقية
    void input;
    const providerRef = `mock_pay_${randomUUID()}`;
    return { providerRef, redirectUrl: `/payments/test-checkout/${providerRef}` };
  }

  /** يبني حدثاً موقّعاً كما ترسله البوابة (تستخدمه صفحة الدفع التجريبية والاختبارات) */
  buildSignedEvent(
    providerRef: string,
    amountHalalas: number,
    outcome: "paid" | "failed",
    now = Math.floor(Date.now() / 1000),
  ) {
    const payload: MockWebhookPayload = {
      id: `evt_${randomUUID()}`,
      type: outcome === "paid" ? "payment_paid" : "payment_failed",
      data: {
        id: providerRef,
        status: outcome,
        amount: amountHalalas,
        currency: "SAR",
        ...(outcome === "failed" && { message: "رُفضت البطاقة (بطاقة اختبار مرفوضة)" }),
      },
    };
    const rawBody = JSON.stringify(payload);
    const headers = new Headers({
      "content-type": "application/json",
      [SIGNATURE_HEADER]: signMockPayload(this.webhookSecret, rawBody, now),
    });
    return { rawBody, headers };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const header = headers.get(SIGNATURE_HEADER) ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((p) => p.trim().split("=", 2) as [string, string]),
    );
    const timestamp = Number(parts.t);
    if (!parts.v1 || !Number.isInteger(timestamp)) {
      throw new WebhookVerificationError("missing signature");
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) {
      throw new WebhookVerificationError("stale signature");
    }
    const expected = signMockPayload(this.webhookSecret, rawBody, timestamp).split("v1=")[1];
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(parts.v1, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookVerificationError("invalid signature");
    }

    const payload = JSON.parse(rawBody) as MockWebhookPayload;
    return {
      eventId: payload.id,
      providerRef: payload.data.id,
      gatewayPaymentId: payload.data.id,
      status: payload.data.status,
      amountHalalas: payload.data.amount,
      currency: payload.data.currency,
      raw: payload,
    };
  }

  async fetchPayment(): Promise<PaymentEvent | null> {
    // البوابة المحلية تبلّغ فقط عبر webhook
    return null;
  }

  async refund(): Promise<RefundResult> {
    const refundRef = `mock_rf_${randomUUID()}`;
    return { refundRef, raw: { id: refundRef, status: "refunded" } };
  }
}
