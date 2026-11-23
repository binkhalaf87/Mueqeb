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
    expect(session.gatewayRef).toBe("pi_test");
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

describe("PaymobGateway fallback lookup (fetchPayment)", () => {
  const ref = "mq_abc123";
  /** يرد بحسب المسار: خريطة بادئة المسار ← الرد */
  function routes(map: Record<string, unknown>) {
    return vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const key = Object.keys(map).find((k) => path.startsWith(k));
      return key ? Response.json(map[key]) : new Response("not found", { status: 404 });
    });
  }

  it("settles a successful transaction found by our reference", async () => {
    const fetchMock = routes({ "/v1/transactions/": { results: [transaction()] } });
    const gateway = new PaymobGateway(config, fetchMock as unknown as typeof fetch);
    const event = await gateway.fetchPayment(ref);
    expect(event).toMatchObject({
      status: "paid",
      providerRef: ref,
      gatewayPaymentId: "987654",
      amountHalalas: 22050,
      currency: "SAR",
      eventId: "paymob_987654_paid",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`special_reference=${ref}`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Token ${config.secretKey}`,
    );
  });

  it("uses the intention first and accepts its transactions by the intention reference", async () => {
    const tx = transaction({ order: { id: 555, merchant_order_id: null } });
    const fetchMock = routes({
      "/v1/intention/": { id: "pi_1", special_reference: ref, transactions: [tx] },
    });
    const gateway = new PaymobGateway(config, fetchMock as unknown as typeof fetch);
    const event = await gateway.fetchPayment(ref, "pi_1");
    expect(event?.status).toBe("paid");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/intention/pi_1/");
  });

  it("falls through 404s to the next known path", async () => {
    const fetchMock = routes({ "/api/acceptance/transactions/": [transaction()] });
    const gateway = new PaymobGateway(config, fetchMock as unknown as typeof fetch);
    expect((await gateway.fetchPayment(ref))?.status).toBe("paid");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ignores other apps' transactions, keeps pending ones open, and maps refunds", async () => {
    const foreign = transaction({ order: { id: 1, merchant_order_id: "jobai_77" } });
    let gateway = new PaymobGateway(
      config,
      routes({ "/v1/transactions/": { results: [foreign] } }) as unknown as typeof fetch,
    );
    expect(await gateway.fetchPayment(ref)).toBeNull();

    gateway = new PaymobGateway(
      config,
      routes({
        "/v1/transactions/": { results: [transaction({ pending: true, success: false })] },
      }) as unknown as typeof fetch,
    );
    expect(await gateway.fetchPayment(ref)).toBeNull();

    gateway = new PaymobGateway(
      config,
      routes({
        "/v1/transactions/": { results: [transaction({ is_refunded: true })] },
      }) as unknown as typeof fetch,
    );
    expect((await gateway.fetchPayment(ref))?.status).toBe("refunded");

    // مرجع ليس من مُعقّب: لا استعلام أصلاً
    const none = vi.fn();
    gateway = new PaymobGateway(config, none as unknown as typeof fetch);
    expect(await gateway.fetchPayment("jobai_1")).toBeNull();
    expect(none).not.toHaveBeenCalled();
  });
});

describe("PaymobGateway webhook with an intention-level reference", () => {
  it("reads the reference from the intention when the transaction has none", async () => {
    const tx = transaction({ order: { id: 555, merchant_order_id: null } });
    const body = JSON.stringify({
      type: "TRANSACTION",
      obj: tx,
      intention: { special_reference: "mq_x1" },
    });
    const url = new URL(
      `https://mueqeb.test/api/payments/webhook?hmac=${paymobHmac(tx, config.hmacSecret)}`,
    );
    const gateway = new PaymobGateway(config);
    const event = await gateway.verifyWebhook(body, new Headers(), url);
    expect(event).toMatchObject({ providerRef: "mq_x1", status: "paid" });
  });
});

describe("PaymobGateway transaction lookup (admin reconcile)", () => {
  it("reads a transaction by id and falls back to the second path", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new URL(url).pathname.startsWith("/v1/transactions/")
        ? Response.json(transaction())
        : new Response("not found", { status: 404 }),
    );
    const gateway = new PaymobGateway(config, fetchMock as unknown as typeof fetch);
    const event = await gateway.fetchTransaction("987654");
    expect(event).toMatchObject({ providerRef: "mq_abc123", status: "paid", amountHalalas: 22050 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/acceptance/transactions/987654");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v1/transactions/987654/");
  });

  it("returns the transaction's own reference (the caller compares it) and rejects bad ids", async () => {
    const foreign = transaction({ order: { id: 1, merchant_order_id: "jobai_77" } });
    const gateway = new PaymobGateway(
      config,
      vi.fn(async () => Response.json(foreign)) as unknown as typeof fetch,
    );
    expect((await gateway.fetchTransaction("1"))?.providerRef).toBe("jobai_77");
    const none = vi.fn();
    const strict = new PaymobGateway(config, none as unknown as typeof fetch);
    expect(await strict.fetchTransaction("1/../x")).toBeNull();
    expect(none).not.toHaveBeenCalled();
  });
});

describe("PaymobGateway automatic inquiry with the API key", () => {
  it("gets a Bearer token once and inquires by our reference", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/auth/tokens") return Response.json({ token: "bearer-1" });
      if (path === "/api/ecommerce/orders/transaction_inquiry") {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer bearer-1");
        expect(JSON.parse(String(init?.body))).toEqual({ merchant_order_id: "mq_abc123" });
        return Response.json(transaction());
      }
      return new Response("not found", { status: 404 });
    });
    const gateway = new PaymobGateway(
      { ...config, inquiryApiKey: "legacy-api-key" },
      fetchMock as unknown as typeof fetch,
    );
    expect((await gateway.fetchPayment("mq_abc123"))?.status).toBe("paid");
    expect((await gateway.fetchPayment("mq_abc123"))?.status).toBe("paid");
    const authCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/api/auth/tokens"));
    expect(authCalls).toHaveLength(1);
  });

  it("does not settle a pending inquiry and skips it without an API key", async () => {
    const pending = vi.fn(async (url: string) =>
      new URL(url).pathname === "/api/auth/tokens"
        ? Response.json({ token: "t" })
        : Response.json(transaction({ pending: true, success: false })),
    );
    const gateway = new PaymobGateway(
      { ...config, inquiryApiKey: "k" },
      pending as unknown as typeof fetch,
    );
    expect(await gateway.fetchPayment("mq_abc123")).toBeNull();

    const urls: string[] = [];
    const noKey = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response("not found", { status: 404 });
    });
    await new PaymobGateway(config, noKey as unknown as typeof fetch).fetchPayment("mq_abc123");
    expect(urls.some((u) => u.includes("/api/auth/tokens"))).toBe(false);
  });
});

describe("PaymobGateway webhook signature sources and forms (Paymob KSA)", () => {
  const gateway = new PaymobGateway(config);
  const tx = transaction();
  const fieldsMessage = () => {
    // نفس رسالة الحقول المستخدمة في paymobHmac
    const sha512 = paymobHmac(tx, config.hmacSecret);
    return sha512;
  };

  it("accepts the signature inside the JSON body with a transaction key", async () => {
    const body = JSON.stringify({ type: "TRANSACTION", transaction: tx, hmac: fieldsMessage() });
    const event = await gateway.verifyWebhook(body, new Headers());
    expect(event).toMatchObject({ providerRef: "mq_abc123", status: "paid" });
  });

  it("accepts the x-paymob-hmac header", async () => {
    const body = JSON.stringify({ type: "TRANSACTION", obj: tx });
    const headers = new Headers({ "x-paymob-hmac": fieldsMessage() });
    expect((await gateway.verifyWebhook(body, headers)).status).toBe("paid");
  });

  it("accepts SHA-512 and SHA-256 over the raw body, and SHA-256 over the fields", async () => {
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify({ type: "TRANSACTION", transaction: tx });
    for (const algo of ["sha512", "sha256"] as const) {
      const sig = createHmac(algo, config.hmacSecret).update(body).digest("hex");
      const event = await gateway.verifyWebhook(body, new Headers({ hmac: sig }));
      expect(event.status).toBe("paid");
    }
    const fields = [
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
    ];
    const message = fields
      .map((f) => {
        const v = f.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tx);
        return v === null || v === undefined ? "" : typeof v === "boolean" ? String(v) : String(v);
      })
      .join("");
    const sha256 = createHmac("sha256", config.hmacSecret).update(message).digest("hex");
    expect((await gateway.verifyWebhook(body, new Headers({ "x-hmac": sha256 }))).status).toBe(
      "paid",
    );
  });

  it("still rejects a wrong or missing signature from any source", async () => {
    const body = JSON.stringify({ type: "TRANSACTION", transaction: tx, hmac: "0".repeat(128) });
    await expect(gateway.verifyWebhook(body, new Headers())).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
    const unsigned = JSON.stringify({ type: "TRANSACTION", transaction: tx });
    await expect(gateway.verifyWebhook(unsigned, new Headers())).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });
});

describe("PaymobGateway inquiry token backoff", () => {
  it("does not request a new token again after a 429", async () => {
    let authCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (new URL(url).pathname === "/api/auth/tokens") {
        authCalls += 1;
        return new Response("too many", { status: 429 });
      }
      return new Response("not found", { status: 404 });
    });
    const gateway = new PaymobGateway(
      { ...config, inquiryApiKey: "k" },
      fetchMock as unknown as typeof fetch,
    );
    await gateway.fetchPayment("mq_abc123");
    await gateway.fetchPayment("mq_abc123");
    await Promise.all([gateway.fetchPayment("mq_a"), gateway.fetchPayment("mq_b")]);
    expect(authCalls).toBe(1);
  });
});
