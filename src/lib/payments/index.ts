import "server-only";
import { MockGateway } from "./mock-gateway";
import { MoyasarGateway } from "./moyasar";
import type { PaymentProvider } from "./types";

let cached: PaymentProvider | undefined;

/**
 * البوابة المهيأة من البيئة (وضع الاختبار فقط):
 * PAYMENT_PROVIDER=moyasar (MOYASAR_SECRET_KEY=sk_test_…, MOYASAR_WEBHOOK_SECRET)
 * PAYMENT_PROVIDER=mock    (MOCK_PAYMENT_WEBHOOK_SECRET) — الافتراضي محلياً
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "moyasar") {
    cached = new MoyasarGateway(
      process.env.MOYASAR_SECRET_KEY ?? "",
      process.env.MOYASAR_WEBHOOK_SECRET ?? "",
    );
  } else if (name === "mock") {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("بوابة الاختبار المحلية غير مسموحة في الإنتاج");
    }
    cached = new MockGateway(process.env.MOCK_PAYMENT_WEBHOOK_SECRET ?? "");
  } else {
    throw new Error(`PAYMENT_PROVIDER غير معروف: ${name}`);
  }
  return cached;
}
