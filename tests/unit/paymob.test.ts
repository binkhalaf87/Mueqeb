import { describe, expect, it, vi } from "vitest";
import { PaymobGateway, paymobHmac } from "@/lib/payments/paymob";
import { IgnoredWebhookEvent, WebhookVerificationError } from "@/lib/payments/types";

const config = {
  secretKey: "sau_sk_test_abc",
  publicKey: "sau_pk_test_xyz",
  integrationIds: [12345],
  hmacSecret: "paymob-hmac-secret-1234",
};

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 987654,
    amount_cents: 22050,
    created_at: "2026-11-03T10:00:00.000000",
    currency: "SAR",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 12345,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 555, merchant_order_id: "mq_abc123" },
    owner: 42,
    pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
    success: true,
    ...overrides,
  };
}

function signed(tx: Record<string, unknown>, secret = config.hmacSecret) {
  const body = JSON.stringify({ type: "TRANSACTION", obj: tx });
  const url = new URL(`https://mueqeb.test/api/payments/webhook?hmac=${paymobHmac(tx, secret)}`);
  return { body, url };
}

describe("PaymobGateway configuration", () => {
  it("accepts test keys only unless live mode is enabled", () => {
    expect(() => new PaymobGateway(config)).not.toThrow();
    expect(() => new PaymobGateway({ ...config, secretKey: "sau_sk_live_abc" })).toThrow(
      /PAYMENTS_LIVE/,
    );
    expect(
      () => new PaymobGateway({ ...config, secretKey: "sau_sk_live_abc" }, fetch, true),
    ).not.toThrow();
    expect(() => new PaymobGateway(config, fetch, true)).toThrow(/المفتاح الحي/);
  });

  it("rejects missing or malformed settings", () => {
    expect(() => new PaymobGateway({ ...config, secretKey: "random" })).toThrow();
    expect(() => new PaymobGateway({ ...config, publicKey: "" })).toThrow();
    expect(() => new PaymobGateway({ ...config, integrationIds: [] })).toThrow();
    expect(() => new PaymobGateway({ ...config, integrationIds: [Number.NaN] })).toThrow();
    expect(() => new PaymobGateway({ ...config, hmacSecret: "short" })).toThrow();
  });
});

describe("PaymobGateway checkout", () => {
  it("creates an intention and redirects to the unified checkout", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "pi_test", client_secret: "sau_csk_test_secret" }),
    );
    const gateway = new PaymobGateway(config, fetchMock as unknown as typeof fetch);
    const session = await gateway.createCheckout({
      orderId: "order-1",
      amountHalalas: 22050,
      description: "مُعقّب — إصدار رخصة عمل",
      callbackUrl: "https://mueqeb.vercel.app/api/payments/return?request=r1",
      customer: { name: "سعد العتيبي", email: "saad@example.com", phone: "+966500000001" },
    });

    expect(session.providerRef).toMatch(/^mq_[0-9a-f]{32}$/);
    const redirect = new URL(session.redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe("https://ksa.paymob.com/unifiedcheckout/");
    expect(redirect.searchParams.get("publicKey")).toBe(config.publicKey);
    expect(redirect.searchParams.get("clientSecret")).toBe("sau_csk_test_secret");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ksa.paymob.com/v1/intention/");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Token ${config.secretKey}`,
    );
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      amount: 22050,
      currency: "SAR",
      payment_methods: [12345],
      special_reference: session.providerRef,
      merchant_order_id: session.providerRef,
      notification_url: "https://mueqeb.vercel.app/api/payments/webhook",
      billing_data: { first_name: "سعد", last_name: "العتيبي", email: "saad@example.com" },
    });
    expect(body.items[0].amount).toBe(22050);
  });

  it("fails when Paymob rejects the intention", async () => {
    const gateway = new PaymobGateway(
      config,
      (async () => new Response("bad", { status: 401 })) as unknown as typeof fetch,
    );
    await expect(
      gateway.createCheckout({
        orderId: "o",
        amountHalalas: 100,
        description: "x",
        callbackUrl: "https://mueqeb.test/r",
      }),
    ).rejects.toThrow(/401/);
  });
});

describe("PaymobGateway webhook", () => {
  const gateway = new PaymobGateway(config);

  it("accepts a correctly signed successful transaction", async () => {
    const { body, url } = signed(transaction());
    const event = await gateway.verifyWebhook(body, new Headers(), url);
    expect(event).toMatchObject({
      providerRef: "mq_abc123",
      gatewayPaymentId: "987654",
      status: "paid",
      amountHalalas: 22050,
      currency: "SAR",
      eventId: "paymob_987654_paid",
    });
  });

  it("rejects a wrong or missing signature, or a tampered amount", async () => {
    const tx = transaction();
    const { body, url } = signed(tx, "another-secret-entirely");
    await expect(gateway.verifyWebhook(body, new Headers(), url)).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
    await expect(gateway.verifyWebhook(body, new Headers())).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
    const good = signed(tx);
    const tampered = good.body.replace('"amount_cents":22050', '"amount_cents":100');
    await expect(gateway.verifyWebhook(tampered, new Headers(), good.url)).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("maps failed and refunded transactions", async () => {
    const failed = signed(transaction({ success: false }));
    expect((await gateway.verifyWebhook(failed.body, new Headers(), failed.url)).status).toBe(
      "failed",
    );
    const refunded = signed(transaction({ is_refunded: true }));
    expect((await gateway.verifyWebhook(refunded.body, new Headers(), refunded.url)).status).toBe(
      "refunded",
    );
  });

  it("ignores pending transactions and orders from other apps on the shared account", async () => {
    const pending = signed(transaction({ pending: true, success: false }));
    await expect(
      gateway.verifyWebhook(pending.body, new Headers(), pending.url),
    ).rejects.toBeInstanceOf(IgnoredWebhookEvent);
    const foreign = signed(transaction({ order: { id: 1, merchant_order_id: "jobai_123" } }));
    await expect(
      gateway.verifyWebhook(foreign.body, new Headers(), foreign.url),
    ).rejects.toBeInstanceOf(IgnoredWebhookEvent);
  });
});

describe("PaymobGateway refund", () => {
  it("refunds the transaction amount and requires success", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 111, success: true }));
    const gateway = new PaymobGateway(config, fetchMock as unknown as typeof fetch);
    const result = await gateway.refund({
      providerRef: "mq_1",
      gatewayPaymentId: "987654",
      amountHalalas: 22050,
    });
    expect(result.refundRef).toBe("111");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ksa.paymob.com/api/acceptance/void_refund/refund");
    expect(JSON.parse(String(init.body))).toEqual({
      transaction_id: "987654",
      amount_cents: 22050,
    });

    const failing = new PaymobGateway(config, (async () =>
      Response.json({ id: 2, success: false, pending: true })) as unknown as typeof fetch);
    await expect(
      failing.refund({ providerRef: "mq_1", gatewayPaymentId: "1", amountHalalas: 1 }),
    ).rejects.toThrow();
  });
});
