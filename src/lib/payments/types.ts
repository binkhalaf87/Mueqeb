/** واجهة بوابة الدفع المجردة: كل بوابة (Moyasar، بوابة الاختبار المحلية…) تطبّقها */

export type GatewayName = "moyasar" | "mock";

export type CheckoutInput = {
  orderId: string;
  amountHalalas: number;
  description: string;
  /** عنوان يعود إليه العميل بعد الدفع */
  callbackUrl: string;
};

export type CheckoutSession = {
  providerRef: string;
  redirectUrl: string;
};

/** حدث موحّد من البوابة بعد التحقق منه */
export type PaymentEvent = {
  /** معرّف الحدث للـ idempotency (null عند التحقق المباشر من البوابة) */
  eventId: string | null;
  providerRef: string;
  gatewayPaymentId: string | null;
  status: "paid" | "failed" | "refunded";
  amountHalalas: number;
  currency: string;
  raw: unknown;
};

export type RefundResult = { refundRef: string; raw: unknown };

export class WebhookVerificationError extends Error {}

export interface PaymentProvider {
  readonly name: GatewayName;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** يتحقق من التوقيع ويعيد الحدث، أو يرمي WebhookVerificationError */
  verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
  /** يستعلم من البوابة مباشرة عن حالة الدفع (null إن لم تدعمه) */
  fetchPayment(providerRef: string): Promise<PaymentEvent | null>;
  /** استرداد كامل؛ يرمي عند الفشل */
  refund(payment: {
    providerRef: string;
    gatewayPaymentId: string | null;
    amountHalalas: number;
  }): Promise<RefundResult>;
}
