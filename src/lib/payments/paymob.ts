import { logError } from "@/lib/log";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  IgnoredWebhookEvent,
  WebhookVerificationError,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  type RefundResult,
} from "./types";

/**
 * Paymob (السعودية) عبر Intention API وصفحة الدفع الموحّدة (Unified Checkout).
 * - بيانات البطاقة لا تمر بخوادمنا؛ العميل يدفع في صفحة Paymob المستضافة.
 * - مرجع المحاولة (providerRef) نولّده نحن ونرسله كـ special_reference وmerchant_order_id،
 *   فيعود في الـ webhook ونطابقه دون تخزين معرّفات Paymob مسبقاً.
 * - الـ webhook موقّع بـ HMAC-SHA512 على حقول المعاملة المرتبة (طريقة Paymob الموثّقة)،
 *   ويصل التوقيع في معامل الرابط ?hmac= (أو ترويسة hmac).
 * - المفتاح السري يحدد الوضع: sau_sk_test_ للاختبار، وsau_sk_live_ للحي (يتطلب PAYMENTS_LIVE=1).
 * المتغيرات بنفس أسماء JobAI: PAYMOB_API_KEY، PAYMOB_PUBLIC_KEY، PAYMOB_INTEGRATION_ID، PAYMOB_HMAC_SECRET.
 */

const BASE = "https://ksa.paymob.com";

/** حقول التوقيع بالترتيب الأبجدي الذي تعتمده Paymob */
export const PAYMOB_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

type PaymobTransaction = Record<string, unknown> & {
  id?: number | string;
  success?: boolean;
  pending?: boolean;
  is_refunded?: boolean;
  is_voided?: boolean;
  amount_cents?: number | string;
  currency?: string;
  order?: { id?: number | string; merchant_order_id?: string | null } | null;
  special_reference?: string | null;
  merchant_order_id?: string | null;
};

function field(obj: Record<string, unknown>, path: string): string {
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return "";
  if (typeof current === "boolean") return current ? "true" : "false";
  return String(current);
}

export function paymobHmac(transaction: Record<string, unknown>, secret: string) {
  const message = PAYMOB_HMAC_FIELDS.map((f) => field(transaction, f)).join("");
  return createHmac("sha512", secret).update(message).digest("hex");
}

function keyMode(secretKey: string): "test" | "live" | null {
  if (/^(sau_)?sk_test_/.test(secretKey)) return "test";
  if (/^(sau_)?sk_live_/.test(secretKey)) return "live";
  return null;
}

export type PaymobConfig = {
  secretKey: string;
  publicKey: string;
  /** معرّفات وسائل الدفع (Integration IDs) مفصولة بفواصل في البيئة */
  integrationIds: number[];
  hmacSecret: string;
};

export class PaymobGateway implements PaymentProvider {
  readonly name = "paymob" as const;

  constructor(
    private readonly config: PaymobConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    readonly live = false,
  ) {
    const mode = keyMode(config.secretKey ?? "");
    if (!mode) throw new Error("PAYMOB_API_KEY غير صالح (المتوقع sau_sk_test_… أو sau_sk_live_…)");
    if (mode === "live" && !live) {
      throw new Error("مفتاح Paymob حي: الوضع الحي يتطلب PAYMENTS_LIVE=1 في بيئة الإنتاج");
    }
    if (mode === "test" && live) {
      throw new Error("PAYMENTS_LIVE=1 مع مفتاح Paymob تجريبي: استخدم المفتاح الحي");
    }
    if (!config.publicKey) throw new Error("PAYMOB_PUBLIC_KEY مطلوب");
    if (
      !config.integrationIds.length ||
      config.integrationIds.some((id) => !Number.isInteger(id))
    ) {
      throw new Error("PAYMOB_INTEGRATION_ID مطلوب (رقم أو أرقام مفصولة بفواصل)");
    }
    if (!config.hmacSecret || config.hmacSecret.length < 16) {
      throw new Error("PAYMOB_HMAC_SECRET مطلوب");
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Paymob ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const providerRef = `mq_${randomUUID().replace(/-/g, "")}`;
    const customer = input.customer;
    const [firstName, ...rest] = (customer?.name || "عميل مُعقّب").trim().split(/\s+/);
    const intention = await this.post<{ client_secret?: string; id?: string | number }>(
      "/v1/intention/",
      {
        amount: input.amountHalalas,
        currency: "SAR",
        payment_methods: this.config.integrationIds,
        items: [{ name: input.description.slice(0, 50), amount: input.amountHalalas, quantity: 1 }],
        billing_data: {
          first_name: firstName,
          last_name: rest.join(" ") || "NA",
          email: customer?.email || "NA",
          phone_number: customer?.phone || "NA",
          country: "SA",
        },
        special_reference: providerRef,
        merchant_order_id: providerRef,
        redirection_url: input.callbackUrl,
        notification_url: new URL("/api/payments/webhook", input.callbackUrl).toString(),
        extras: { order_id: input.orderId },
      },
    );
    if (!intention.client_secret) throw new Error("Paymob intention without client_secret");
    const url = new URL("/unifiedcheckout/", BASE);
    url.searchParams.set("publicKey", this.config.publicKey);
    url.searchParams.set("clientSecret", intention.client_secret);
    return {
      providerRef,
      redirectUrl: url.toString(),
      gatewayRef: intention.id === undefined ? undefined : String(intention.id),
    };
  }

  async verifyWebhook(rawBody: string, headers: Headers, url?: URL): Promise<PaymentEvent> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new WebhookVerificationError("invalid json");
    }
    const tx = (payload.obj ?? payload.transaction ?? payload) as PaymobTransaction;
    if (!tx || typeof tx !== "object") throw new WebhookVerificationError("no transaction");

    const provided = (url?.searchParams.get("hmac") ?? headers.get("hmac") ?? "").toLowerCase();
    const expected = paymobHmac(tx, this.config.hmacSecret);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookVerificationError("invalid hmac");
    }

    // في Paymob السعودية قد يكون المرجع في كائن intention لا في المعاملة نفسها
    const providerRef = referenceOf(tx) ?? intentionReference(payload);
    if (!providerRef) throw new IgnoredWebhookEvent("no merchant reference");
    // معاملات حساب Paymob المشترك التي لم تُنشأ من مُعقّب
    if (!providerRef.startsWith("mq_")) throw new IgnoredWebhookEvent("foreign order");
    if (tx.pending && !tx.is_refunded) throw new IgnoredWebhookEvent("pending");
    return transactionEvent(tx, providerRef, payload);
  }

  private async get(path: string): Promise<{ status: number; body: unknown }> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      method: "GET",
      headers: { Authorization: `Token ${this.config.secretKey}` },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }

  /**
   * استعلام احتياطي من الخادم بالمفتاح السري حين لا يصل الـ webhook.
   * يجرّب مسارات Paymob المعروفة بالترتيب، ولا يقبل إلا معاملة مرجعها مرجعنا نفسه.
   * المعلّقة لا تُحسم (null)، والنتيجة تمر بالمسار idempotent نفسه للـ webhook.
   */
  async fetchPayment(
    providerRef: string,
    gatewayRef?: string | null,
  ): Promise<PaymentEvent | null> {
    if (!providerRef.startsWith("mq_")) return null;
    const ref = encodeURIComponent(providerRef);
    const paths = [
      ...(gatewayRef ? [`/v1/intention/${encodeURIComponent(gatewayRef)}/`] : []),
      `/v1/transactions/?special_reference=${ref}`,
      `/v1/transactions/?merchant_order_id=${ref}`,
      `/api/acceptance/transactions/?merchant_order_id=${ref}`,
    ];
    for (const path of paths) {
      let result: { status: number; body: unknown };
      try {
        result = await this.get(path);
      } catch (error) {
        logError(`paymob lookup ${path.split("?")[0]}`, error);
        continue;
      }
      // معاملات intention مرجعها مرجعنا (المرجع قد يكون على مستوى intention فقط)
      const intentionMatches = intentionReference(result.body) === providerRef;
      const candidates = transactionsIn(result.body).filter((tx) => {
        const ref = referenceOf(tx);
        return ref === providerRef || (ref === null && intentionMatches);
      });
      console.info(
        `[paymob lookup] ${path.split("?")[0]} → ${result.status}, ${candidates.length} matching tx`,
      );
      if (!candidates.length) continue;
      // أولوية: المسترد ثم الناجح ثم الفاشل؛ المعلّق لا يُحسم
      const settled = candidates.filter((tx) => !tx.pending || tx.is_refunded);
      const pick =
        settled.find((tx) => tx.is_refunded) ??
        settled.find((tx) => tx.success && !tx.is_voided) ??
        settled[0];
      return pick ? transactionEvent(pick, providerRef, pick) : null;
    }
    return null;
  }

  async refund(payment: {
    providerRef: string;
    gatewayPaymentId: string | null;
    amountHalalas: number;
  }): Promise<RefundResult> {
    if (!payment.gatewayPaymentId) throw new Error("gateway payment id is required for refund");
    const result = await this.post<{ id?: number | string; success?: boolean; pending?: boolean }>(
      "/api/acceptance/void_refund/refund",
      { transaction_id: payment.gatewayPaymentId, amount_cents: payment.amountHalalas },
    );
    // الاسترداد المعلّق لا يُسجَّل كناجح: يُعاد المحاولة لاحقاً أو يصل حدثه عبر الـ webhook
    if (!result.success) throw new Error("Paymob refund was not successful");
    return { refundRef: String(result.id ?? payment.gatewayPaymentId), raw: result };
  }
}

/** مرجعنا في المعاملة (merchant_order_id أو special_reference) */
function referenceOf(tx: PaymobTransaction): string | null {
  const ref = tx.order?.merchant_order_id ?? tx.special_reference ?? tx.merchant_order_id;
  return ref ? String(ref) : null;
}

/** تحويل معاملة Paymob إلى حدث موحّد (مشترك بين الـ webhook والاستعلام المباشر) */
function transactionEvent(tx: PaymobTransaction, providerRef: string, raw: unknown): PaymentEvent {
  let status: PaymentEvent["status"];
  if (tx.is_refunded) status = "refunded";
  else if (tx.success && !tx.is_voided) status = "paid";
  else status = "failed";
  return {
    eventId: `paymob_${tx.id}_${status}`,
    providerRef,
    gatewayPaymentId: tx.id === undefined ? null : String(tx.id),
    status,
    amountHalalas: Number(tx.amount_cents),
    currency: String(tx.currency ?? ""),
    raw,
  };
}

/** المعاملات من رد Paymob أياً كان شكله (قائمة، results، data، أو intention فيها transactions) */
function transactionsIn(body: unknown): PaymobTransaction[] {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body)) return body.filter(isObject) as PaymobTransaction[];
  const obj = body as Record<string, unknown>;
  for (const key of ["results", "data", "transactions", "payment_attempts", "confirmation"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value.filter(isObject) as PaymobTransaction[];
    if (isObject(value) && "success" in value) return [value as PaymobTransaction];
  }
  if ("success" in obj && "amount_cents" in obj) return [obj as PaymobTransaction];
  return [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** مرجعنا على مستوى intention (رد /v1/intention أو حقل intention في الإشعار) */
function intentionReference(body: unknown): string | null {
  if (!isObject(body)) return null;
  const intention = isObject(body.intention) ? body.intention : body;
  const ref = intention.special_reference ?? intention.merchant_order_id;
  return typeof ref === "string" && ref ? ref : null;
}
