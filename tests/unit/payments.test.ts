import { describe, expect, it, vi } from "vitest";
import { calcOrderAmounts, ledgerImbalance, pctToBps, roundBps } from "@/lib/payments/amounts";
import { MOCK_TEST_CARDS, MockGateway, signMockPayload } from "@/lib/payments/mock-gateway";
import { MoyasarGateway } from "@/lib/payments/moyasar";
import { WebhookVerificationError } from "@/lib/payments/types";

describe("pctToBps", () => {
  it("converts percentages to integer basis points", () => {
    expect(pctToBps(15)).toBe(1500);
    expect(pctToBps(5)).toBe(500);
    expect(pctToBps(2.5)).toBe(250);
    expect(pctToBps(0)).toBe(0);
    expect(pctToBps(100)).toBe(10_000);
  });

  it("rejects invalid percentages", () => {
    expect(() => pctToBps(-1)).toThrow();
    expect(() => pctToBps(101)).toThrow();
    expect(() => pctToBps(Number.NaN)).toThrow();
  });
});

describe("roundBps (round half up, integer halalas)", () => {
  it.each([
    [18000, 500, 900], // 5% من 180 ر.س
    [18000, 1500, 2700],
    [10, 500, 1], // 0.5 هللة → 1
    [9, 500, 0], // 0.45 → 0
    [30, 1500, 5], // 4.5 → 5
    [29, 1500, 4], // 4.35 → 4
    [333, 500, 17], // 16.65 → 17
    [333, 1500, 50], // 49.95 → 50
    [1, 5000, 1], // 0.5 → 1
    [1, 4999, 0],
    [12345, 0, 0],
    [12345, 10_000, 12345],
  ])("roundBps(%i, %i) = %i", (amount, bps, expected) => {
    expect(roundBps(amount, bps)).toBe(expected);
  });

  it("is exact for very large amounts (no floating point)", () => {
    // 90,071,992,547,409.91 ر.س تقريباً — الحد الآمن للأعداد
    const big = Number.MAX_SAFE_INTEGER;
    expect(roundBps(big, 10_000)).toBe(big);
    expect(Number.isSafeInteger(roundBps(big, 1500))).toBe(true);
    // 100,000,000,004 × 15% = 15,000,000,000.6 → 15,000,000,001 (يفشل لو حُسب بكسور عشرية مقرّبة)
    expect(roundBps(100_000_000_004, 1500)).toBe(15_000_000_001);
    expect(roundBps(100_000_000_003, 1500)).toBe(15_000_000_000);
  });

  it("rejects fractional or negative inputs", () => {
    expect(() => roundBps(10.5, 500)).toThrow();
    expect(() => roundBps(-1, 500)).toThrow();
    expect(() => roundBps(100, 500.5)).toThrow();
    expect(() => roundBps(100, 10_001)).toThrow();
  });
});

describe("calcOrderAmounts", () => {
  it("computes the default 5% client fee and 15% commission", () => {
    expect(calcOrderAmounts(18000, 500, 1500)).toEqual({
      feeHalalas: 18000,
      clientFeeHalalas: 900,
      providerCommissionHalalas: 2700,
      providerNetHalalas: 15300,
      totalPaidHalalas: 18900,
      platformRevenueHalalas: 3600,
    });
  });

  it("handles edge cases: 1 halala, 0% and 100% rates", () => {
    expect(calcOrderAmounts(1, 500, 1500)).toMatchObject({
      clientFeeHalalas: 0,
      providerCommissionHalalas: 0,
      totalPaidHalalas: 1,
      providerNetHalalas: 1,
    });
    expect(calcOrderAmounts(10000, 0, 0)).toMatchObject({
      totalPaidHalalas: 10000,
      providerNetHalalas: 10000,
      platformRevenueHalalas: 0,
    });
    expect(calcOrderAmounts(10000, 10_000, 10_000)).toMatchObject({
      totalPaidHalalas: 20000,
      providerNetHalalas: 0,
      platformRevenueHalalas: 20000,
    });
  });

  it("rejects a zero or fractional fee", () => {
    expect(() => calcOrderAmounts(0, 500, 1500)).toThrow();
    expect(() => calcOrderAmounts(100.5, 500, 1500)).toThrow();
  });

  it("keeps every invariant for 5,000 random amounts and rates", () => {
    let seed = 42;
    const rand = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % max;
    };
    for (let i = 0; i < 5000; i++) {
      const fee = 1 + rand(10_000_000);
      const clientBps = rand(10_001);
      const commissionBps = rand(10_001);
      const a = calcOrderAmounts(fee, clientBps, commissionBps);
      for (const v of Object.values(a)) {
        expect(Number.isSafeInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(a.totalPaidHalalas).toBe(fee + a.clientFeeHalalas);
      expect(a.providerNetHalalas + a.providerCommissionHalalas).toBe(fee);
      expect(a.platformRevenueHalalas).toBe(a.clientFeeHalalas + a.providerCommissionHalalas);
      // المال محفوظ: ما يدفعه العميل = صافي المزوّد + إيراد المنصة
      expect(a.totalPaidHalalas).toBe(a.providerNetHalalas + a.platformRevenueHalalas);
      // التقريب لا يبتعد عن القيمة الدقيقة بأكثر من نصف هللة
      expect(Math.abs(a.clientFeeHalalas - (fee * clientBps) / 10_000)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("ledgerImbalance", () => {
  it("is zero for balanced entries", () => {
    expect(
      ledgerImbalance([
        { account: "client", debit_halalas: 0, credit_halalas: 18900 },
        { account: "escrow", debit_halalas: 18900, credit_halalas: 0 },
        { account: "escrow", debit_halalas: 0, credit_halalas: 18900 },
        { account: "client", debit_halalas: 18900, credit_halalas: 0 },
      ]),
    ).toBe(0);
    expect(ledgerImbalance([{ account: "escrow", debit_halalas: 5, credit_halalas: 0 }])).toBe(5);
  });
});

describe("MockGateway (signed webhooks)", () => {
  const secret = "test-secret-0123456789";
  const gateway = new MockGateway(secret);

  it("requires a strong secret", () => {
    expect(() => new MockGateway("short")).toThrow();
  });

  it("verifies a correctly signed event", async () => {
    const { rawBody, headers } = gateway.buildSignedEvent("mock_pay_1", 18900, "paid");
    const event = await gateway.verifyWebhook(rawBody, headers);
    expect(event).toMatchObject({
      providerRef: "mock_pay_1",
      status: "paid",
      amountHalalas: 18900,
      currency: "SAR",
    });
    expect(event.eventId).toMatch(/^evt_/);
  });

  it("rejects tampered bodies, wrong secrets, stale or missing signatures", async () => {
    const { rawBody, headers } = gateway.buildSignedEvent("mock_pay_1", 18900, "paid");
    await expect(
      gateway.verifyWebhook(rawBody.replace("18900", "100"), headers),
    ).rejects.toBeInstanceOf(WebhookVerificationError);

    const other = new MockGateway("another-secret-0123456789");
    await expect(other.verifyWebhook(rawBody, headers)).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );

    const stale = Math.floor(Date.now() / 1000) - 3600;
    const staleHeaders = new Headers({
      "x-mock-signature": signMockPayload(secret, rawBody, stale),
    });
    await expect(gateway.verifyWebhook(rawBody, staleHeaders)).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );

    await expect(gateway.verifyWebhook(rawBody, new Headers())).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("exposes the documented test cards", () => {
    expect(MOCK_TEST_CARDS.success).toBe("4111111111111111");
    expect(MOCK_TEST_CARDS.declined).toBe("4000000000000002");
  });
});

describe("MoyasarGateway (test mode only)", () => {
  const webhookSecret = "moyasar-webhook-secret-123";

  it("refuses live or missing keys", () => {
    expect(() => new MoyasarGateway("sk_live_abc", webhookSecret)).toThrow(/sk_test_/);
    expect(() => new MoyasarGateway("", webhookSecret)).toThrow();
    expect(() => new MoyasarGateway("sk_test_abc", "")).toThrow();
  });

  it("creates a hosted invoice in halalas with basic auth", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "inv_123", url: "https://checkout.moyasar.com/invoices/inv_123" }),
    );
    const gateway = new MoyasarGateway("sk_test_abc", webhookSecret, fetchMock as typeof fetch);
    const session = await gateway.createCheckout({
      orderId: "order-1",
      amountHalalas: 18900,
      description: "مُعقّب",
      callbackUrl: "http://localhost:3000/api/payments/return?request=r1",
    });
    expect(session).toEqual({
      providerRef: "inv_123",
      redirectUrl: "https://checkout.moyasar.com/invoices/inv_123",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.moyasar.com/v1/invoices");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("sk_test_abc:").toString("base64")}`,
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: 18900,
      currency: "SAR",
      metadata: { order_id: "order-1" },
    });
  });

  it("verifies the webhook secret token and maps the payment", async () => {
    const gateway = new MoyasarGateway("sk_test_abc", webhookSecret);
    const body = JSON.stringify({
      id: "evt_1",
      type: "payment_paid",
      secret_token: webhookSecret,
      live: false,
      data: { id: "pay_1", status: "paid", amount: 18900, currency: "SAR", invoice_id: "inv_123" },
    });
    await expect(gateway.verifyWebhook(body, new Headers())).resolves.toMatchObject({
      eventId: "evt_1",
      providerRef: "inv_123",
      gatewayPaymentId: "pay_1",
      status: "paid",
      amountHalalas: 18900,
    });

    await expect(
      gateway.verifyWebhook(body.replace(webhookSecret, "wrong-secret-xxxxxxxxx"), new Headers()),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(
      gateway.verifyWebhook(body.replace('"live":false', '"live":true'), new Headers()),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(gateway.verifyWebhook("not json", new Headers())).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("refunds the full amount through the payments API", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "pay_1", status: "refunded", amount: 18900, currency: "SAR" }),
    );
    const gateway = new MoyasarGateway("sk_test_abc", webhookSecret, fetchMock as typeof fetch);
    await expect(
      gateway.refund({ providerRef: "inv_123", gatewayPaymentId: "pay_1", amountHalalas: 18900 }),
    ).resolves.toMatchObject({ refundRef: "pay_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.moyasar.com/v1/payments/pay_1/refund");
    expect(JSON.parse(init.body as string)).toEqual({ amount: 18900 });
  });

  it("fails loudly when the gateway does not confirm the refund", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "pay_1", status: "paid" }));
    const gateway = new MoyasarGateway("sk_test_abc", webhookSecret, fetchMock as typeof fetch);
    await expect(
      gateway.refund({ providerRef: "inv_123", gatewayPaymentId: "pay_1", amountHalalas: 18900 }),
    ).rejects.toThrow();
  });

  it("verifies the return by fetching the invoice from the gateway", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "inv_123",
        status: "paid",
        payments: [{ id: "pay_1", status: "paid", amount: 18900, currency: "SAR" }],
      }),
    );
    const gateway = new MoyasarGateway("sk_test_abc", webhookSecret, fetchMock as typeof fetch);
    await expect(gateway.fetchPayment("inv_123")).resolves.toMatchObject({
      eventId: null,
      providerRef: "inv_123",
      gatewayPaymentId: "pay_1",
      status: "paid",
    });
  });
});
