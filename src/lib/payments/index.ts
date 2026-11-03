import "server-only";
import { MockGateway } from "./mock-gateway";
import { MoyasarGateway } from "./moyasar";
import { PaymobGateway } from "./paymob";
import type { PaymentProvider } from "./types";

let cached: PaymentProvider | undefined;

/**
 * البوابة المهيأة من البيئة (وضع الاختبار فقط):
 * PAYMENT_PROVIDER=moyasar (MOYASAR_SECRET_KEY=sk_test_…, MOYASAR_WEBHOOK_SECRET)
 * PAYMENT_PROVIDER=paymob  (PAYMOB_API_KEY=sau_sk_test_…, PAYMOB_PUBLIC_KEY، PAYMOB_INTEGRATION_ID، PAYMOB_HMAC_SECRET)
 * PAYMENT_PROVIDER=mock    (MOCK_PAYMENT_WEBHOOK_SECRET) — الافتراضي محلياً
 * بوابة الاختبار مرفوضة في بيئة الإنتاج (Railway أو Vercel) إلا بموافقة صريحة لنسخة عرض تجريبية:
 * ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=1
 */
export function isProductionDeployment(env: Record<string, string | undefined> = process.env) {
  const railway = env.RAILWAY_ENVIRONMENT_NAME ?? env.RAILWAY_ENVIRONMENT;
  return env.VERCEL_ENV === "production" || railway === "production";
}

/**
 * الوضع الحي (مبالغ حقيقية) لا يُفعَّل إلا بقرار صريح PAYMENTS_LIVE=1 وفي بيئة الإنتاج فقط؛
 * طلبه خارج الإنتاج خطأ صريح بدل التراجع بصمت لوضع الاختبار.
 */
export function isLiveMode(env: Record<string, string | undefined> = process.env) {
  if (env.PAYMENTS_LIVE !== "1") return false;
  if (!isProductionDeployment(env)) {
    throw new Error("PAYMENTS_LIVE=1 مسموح في بيئة الإنتاج فقط");
  }
  return true;
}

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "moyasar") {
    cached = new MoyasarGateway(
      process.env.MOYASAR_SECRET_KEY ?? "",
      process.env.MOYASAR_WEBHOOK_SECRET ?? "",
      fetch,
      isLiveMode(),
    );
  } else if (name === "paymob") {
    cached = new PaymobGateway(
      {
        secretKey: process.env.PAYMOB_API_KEY ?? "",
        publicKey: process.env.PAYMOB_PUBLIC_KEY ?? "",
        integrationIds: (process.env.PAYMOB_INTEGRATION_ID ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number),
        hmacSecret: process.env.PAYMOB_HMAC_SECRET ?? "",
      },
      fetch,
      isLiveMode(),
    );
  } else if (name === "mock") {
    if (isProductionDeployment() && process.env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION !== "1") {
      throw new Error("بوابة الاختبار المحلية غير مسموحة في الإنتاج");
    }
    cached = new MockGateway(process.env.MOCK_PAYMENT_WEBHOOK_SECRET ?? "");
  } else {
    throw new Error(`PAYMENT_PROVIDER غير معروف: ${name}`);
  }
  return cached;
}
