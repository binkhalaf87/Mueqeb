/**
 * الطلبات المالية والمدفوعات ودفتر الحسابات على Supabase المحلي.
 * يستخدم اتصال Postgres مباشراً (كمالك القاعدة) لإثبات أن الدفتر لا يُعدّل حتى بأعلى صلاحية.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcOrderAmounts } from "@/lib/payments/amounts";
import { createTestUser, serviceClient, supabaseAvailable, type Client } from "./helpers";

const available = await supabaseAvailable();
const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function randomCr() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

describe.skipIf(!available)("orders, payments & append-only ledger (local Supabase)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];
  let serviceTypeId: string;
  let minFee: number;

  beforeAll(async () => {
    await db.connect();
    const { data } = await admin
      .from("service_types")
      .select("id, min_fee_halalas")
      .eq("slug", "gosi_add_remove_contributor")
      .single();
    serviceTypeId = data!.id;
    minFee = data!.min_fee_halalas;
  });

  afterAll(async () => {
    // الدفتر append-only عمداً: بيانات الاختبار تبقى في القاعدة المحلية (تُمسح بـ db:reset).
    // نحذف المستخدمين فقط حيث لا قيود مرتبطة.
    await db.end();
  });

  async function makeProvider(city: string, fee: number) {
    const user = await createTestUser(admin, created);
    await admin.from("profiles").update({ role: "provider" }).eq("id", user.id);
    const { data: provider } = await admin
      .from("providers")
      .insert({
        profile_id: user.id,
        office_name: `مكتب ${randomUUID().slice(0, 6)}`,
        cr_number: randomCr(),
        municipal_license_number: "LIC-0001",
        cities: [city],
        verification_status: "approved",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    await admin.from("provider_services").insert({
      provider_id: provider!.id,
      service_type_id: serviceTypeId,
      fee_halalas: fee,
      duration_days: 2,
    });
    return { ...user, providerId: provider!.id };
  }

  async function makeRequester() {
    const user = await createTestUser(admin, created);
    await user.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الدفع",
      p_cr_number: randomCr(),
    });
    const { data: account } = await user.client.from("requester_accounts").select("id").single();
    return { ...user, accountId: account!.id };
  }

  /** طلب مباشر بالسعر المعلن → awarded_unpaid مع طلب مالي */
  async function awardedOrder(fee = minFee + 3333) {
    const city = `مدينة-${randomUUID().slice(0, 8)}`;
    const provider = await makeProvider(city, fee);
    const requester = await makeRequester();
    const { data: requestId, error } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: serviceTypeId,
      p_mode: "direct_listed",
      p_target_provider_id: provider.providerId,
      p_city: city,
    });
    if (error) throw error;
    const { data: order } = await admin
      .from("orders")
      .select("*")
      .eq("request_id", requestId!)
      .single();
    return { provider, requester, requestId: requestId!, order: order! };
  }

  async function attempt(orderId: string, amount: number) {
    const ref = `mock_pay_${randomUUID()}`;
    const { data: paymentId, error } = await admin.rpc("register_payment_attempt", {
      p_order_id: orderId,
      p_gateway: "mock",
      p_provider_ref: ref,
      p_amount_halalas: amount,
    });
    if (error) throw error;
    return { ref, paymentId: paymentId! };
  }

  function result(ref: string, amount: number, status = "paid", eventId = `evt_${randomUUID()}`) {
    return admin.rpc("record_payment_result", {
      p_gateway: "mock",
      p_event_id: eventId,
      p_provider_ref: ref,
      p_status: status,
      p_amount_halalas: amount,
      p_currency: "SAR",
      p_gateway_payment_id: ref,
      p_raw: { test: true },
    });
  }

  async function ledger(orderId: string) {
    const { rows } = await db.query(
      "select journal_id, account, debit_halalas::int as debit, credit_halalas::int as credit, reverses_journal_id from ledger_entries where order_id = $1 order by id",
      [orderId],
    );
    return rows as {
      journal_id: string;
      account: string;
      debit: number;
      credit: number;
      reverses_journal_id: string | null;
    }[];
  }

  async function requestStatus(requestId: string) {
    return (await admin.from("service_requests").select("status").eq("id", requestId).single())
      .data!.status;
  }

  it("creates the order on award with amounts and rates frozen from settings", async () => {
    const fee = minFee + 3333; // 133.33 ر.س إن كان الحد الأدنى 100
    const { order } = await awardedOrder(fee);
    const expected = calcOrderAmounts(fee, 500, 1500);
    expect(order).toMatchObject({
      fee_halalas: fee,
      client_fee_bps: 500,
      provider_commission_bps: 1500,
      client_fee_halalas: expected.clientFeeHalalas,
      provider_commission_halalas: expected.providerCommissionHalalas,
      provider_net_halalas: expected.providerNetHalalas,
      total_paid_halalas: expected.totalPaidHalalas,
      payment_status: "unpaid",
    });

    // تغيير النسب لاحقاً لا يغيّر طلباً قائماً، ويُطبَّق على الطلبات الجديدة
    await db.query("update settings set value = '7.5' where key = 'client_fee_pct'");
    try {
      const { data: same } = await admin
        .from("orders")
        .select("client_fee_bps")
        .eq("id", order.id)
        .single();
      expect(same!.client_fee_bps).toBe(500);
      const { order: newer } = await awardedOrder(fee);
      expect(newer.client_fee_bps).toBe(750);
      expect(newer.client_fee_halalas).toBe(calcOrderAmounts(fee, 750, 1500).clientFeeHalalas);
    } finally {
      await db.query("update settings set value = '5' where key = 'client_fee_pct'");
    }
  });

  it("SQL and TypeScript amount calculations agree", async () => {
    const { rows } = await db.query(
      `select f, b, public.round_bps(f, b)::bigint as r
       from generate_series(1, 4001, 37) f, unnest(array[0, 1, 250, 500, 1500, 3333, 5000, 9999, 10000]) b`,
    );
    for (const row of rows as { f: number; b: number; r: string }[]) {
      const ts = calcOrderAmounts(row.f, row.b, 0).clientFeeHalalas;
      expect(Number(row.r)).toBe(ts);
    }
  });

  it("successful payment: client → escrow, balanced, request paid → awaiting_client", async () => {
    const { order, requestId } = await awardedOrder();
    const { ref } = await attempt(order.id, order.total_paid_halalas);

    expect((await result(ref, order.total_paid_halalas)).data).toBe("processed");

    const lines = await ledger(order.id);
    expect(lines).toEqual([
      expect.objectContaining({ account: "client", debit: 0, credit: order.total_paid_halalas }),
      expect.objectContaining({ account: "escrow", debit: order.total_paid_halalas, credit: 0 }),
    ]);
    expect(lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);

    expect(await requestStatus(requestId)).toBe("awaiting_client");
    const { data: o } = await admin
      .from("orders")
      .select("payment_status")
      .eq("id", order.id)
      .single();
    expect(o!.payment_status).toBe("paid");
    const { data: events } = await admin
      .from("order_events")
      .select("to_status, actor_role")
      .eq("request_id", requestId)
      .in("to_status", ["paid", "awaiting_client"])
      .order("created_at");
    expect(events).toEqual([
      { to_status: "paid", actor_role: "system" },
      { to_status: "awaiting_client", actor_role: "system" },
    ]);
  });

  it("webhooks are idempotent: replays and re-deliveries never double-post", async () => {
    const { order } = await awardedOrder();
    const { ref } = await attempt(order.id, order.total_paid_halalas);
    const eventId = `evt_${randomUUID()}`;

    expect((await result(ref, order.total_paid_halalas, "paid", eventId)).data).toBe("processed");
    expect((await result(ref, order.total_paid_halalas, "paid", eventId)).data).toBe("duplicate");
    // حدث مختلف لنفس الدفعة (مثل التحقق عند العودة)
    expect((await result(ref, order.total_paid_halalas, "paid")).data).toBe("duplicate");
    expect(await ledger(order.id)).toHaveLength(2);
  });

  it("rejects amount mismatches without posting to the ledger", async () => {
    const { order, requestId } = await awardedOrder();
    const { ref } = await attempt(order.id, order.total_paid_halalas);
    expect((await result(ref, order.total_paid_halalas - 1)).data).toBe("failed");
    expect(await ledger(order.id)).toHaveLength(0);
    expect(await requestStatus(requestId)).toBe("awarded_unpaid");

    const wrong = await admin.rpc("register_payment_attempt", {
      p_order_id: order.id,
      p_gateway: "mock",
      p_provider_ref: `mock_pay_${randomUUID()}`,
      p_amount_halalas: order.total_paid_halalas + 100,
    });
    expect(wrong.error?.message).toContain("amount_mismatch");
  });

  it("a failed payment changes nothing and allows a new attempt", async () => {
    const { order, requestId } = await awardedOrder();
    const first = await attempt(order.id, order.total_paid_halalas);
    expect((await result(first.ref, order.total_paid_halalas, "failed")).data).toBe("failed");
    expect(await ledger(order.id)).toHaveLength(0);
    expect(await requestStatus(requestId)).toBe("awarded_unpaid");

    const second = await attempt(order.id, order.total_paid_halalas);
    expect((await result(second.ref, order.total_paid_halalas)).data).toBe("processed");
  });

  describe("ledger is append-only", () => {
    let orderId: string;
    beforeAll(async () => {
      const { order } = await awardedOrder();
      const { ref } = await attempt(order.id, order.total_paid_halalas);
      await result(ref, order.total_paid_halalas);
      orderId = order.id;
    });

    it("blocks UPDATE, DELETE and TRUNCATE even for the database owner", async () => {
      await expect(
        db.query(
          "update ledger_entries set debit_halalas = debit_halalas + 1 where order_id = $1",
          [orderId],
        ),
      ).rejects.toThrow(/ledger_is_append_only/);
      await expect(
        db.query("delete from ledger_entries where order_id = $1", [orderId]),
      ).rejects.toThrow(/ledger_is_append_only/);
      await expect(db.query("truncate ledger_entries cascade")).rejects.toThrow(
        /ledger_is_append_only/,
      );
      expect(await ledger(orderId)).toHaveLength(2);
    });

    it("rejects an unbalanced journal at commit", async () => {
      await db.query("begin");
      await db.query(
        "insert into ledger_entries (journal_id, order_id, account, debit_halalas, description) values ($1, $2, 'escrow', 100, 'غير متوازن')",
        [randomUUID(), orderId],
      );
      await expect(db.query("commit")).rejects.toThrow(/ledger_journal_unbalanced/);
      expect(await ledger(orderId)).toHaveLength(2);
    });

    it("cannot be written through the API, even with the service key", async () => {
      const { error } = await admin.from("ledger_entries").insert({
        journal_id: randomUUID(),
        order_id: orderId,
        account: "escrow",
        debit_halalas: 1,
        description: "x",
      });
      expect(error).not.toBeNull();
      const { error: updateError } = await admin
        .from("ledger_entries")
        .update({ description: "تعديل" })
        .eq("order_id", orderId);
      expect(updateError).not.toBeNull();
      const { error: rpcError } = await admin.rpc("ledger_transfer" as never, {} as never);
      expect(rpcError).not.toBeNull();
    });
  });

  it("refund before execution: reversing journal, order refunded, request cancelled", async () => {
    const { order, requestId, requester } = await awardedOrder();
    const { ref, paymentId } = await attempt(order.id, order.total_paid_halalas);
    await result(ref, order.total_paid_halalas);

    // لا يُلغى طلب مدفوع دون استرداد
    const direct = await requester.client.rpc("transition_request", {
      p_request_id: requestId,
      p_to: "cancelled",
    });
    expect(direct.error?.message).toContain("forbidden_transition");

    const { data, error } = await admin.rpc("record_refund", {
      p_payment_id: paymentId,
      p_refund_ref: "mock_rf_1",
      p_amount_halalas: order.total_paid_halalas,
      p_raw: {},
      p_cancel_request: true,
      p_note: "اختبار",
    });
    expect(error).toBeNull();
    expect(data).toBe("processed");

    const lines = await ledger(order.id);
    expect(lines).toHaveLength(4);
    const [paidJournal, reverseJournal] = [lines[0].journal_id, lines[2].journal_id];
    expect(lines.slice(2)).toEqual([
      expect.objectContaining({
        account: "escrow",
        credit: order.total_paid_halalas,
        reverses_journal_id: paidJournal,
      }),
      expect.objectContaining({
        account: "client",
        debit: order.total_paid_halalas,
        reverses_journal_id: paidJournal,
      }),
    ]);
    expect(reverseJournal).not.toBe(paidJournal);

    const { data: balances } = await admin.rpc("order_ledger_balances", { p_order_id: order.id });
    for (const b of balances!) expect(Number(b.balance_halalas)).toBe(0);

    expect(await requestStatus(requestId)).toBe("cancelled");
    const { data: o } = await admin
      .from("orders")
      .select("payment_status")
      .eq("id", order.id)
      .single();
    expect(o!.payment_status).toBe("refunded");

    // استرداد مكرر لا يُنشئ قيوداً جديدة
    const again = await admin.rpc("record_refund", {
      p_payment_id: paymentId,
      p_refund_ref: "mock_rf_1",
      p_amount_halalas: order.total_paid_halalas,
      p_raw: {},
      p_cancel_request: true,
    });
    expect(again.data).toBe("duplicate");
    expect(await ledger(order.id)).toHaveLength(4);
  });

  it("partial refunds are not supported", async () => {
    const { order } = await awardedOrder();
    const { ref, paymentId } = await attempt(order.id, order.total_paid_halalas);
    await result(ref, order.total_paid_halalas);
    const { error } = await admin.rpc("record_refund", {
      p_payment_id: paymentId,
      p_refund_ref: "x",
      p_amount_halalas: order.total_paid_halalas - 1,
      p_raw: {},
      p_cancel_request: true,
    });
    expect(error?.message).toContain("partial_refund_not_supported");
  });

  it("a payment arriving after cancellation, or a second payment, is flagged for refund", async () => {
    const { order, requestId, requester } = await awardedOrder();
    const late = await attempt(order.id, order.total_paid_halalas);
    await requester.client.rpc("transition_request", {
      p_request_id: requestId,
      p_to: "cancelled",
    });
    expect((await result(late.ref, order.total_paid_halalas)).data).toBe("refund_required");

    const second = await awardedOrder();
    const a = await attempt(second.order.id, second.order.total_paid_halalas);
    const b = await attempt(second.order.id, second.order.total_paid_halalas);
    expect((await result(a.ref, second.order.total_paid_halalas)).data).toBe("processed");
    expect((await result(b.ref, second.order.total_paid_halalas)).data).toBe("refund_required");
  });

  it("RLS: who can see orders, payments and the ledger", async () => {
    const { order, provider, requester } = await awardedOrder();
    const { ref } = await attempt(order.id, order.total_paid_halalas);
    await result(ref, order.total_paid_halalas);
    const stranger = await makeRequester();
    const adminUser = await (async () => {
      const { signIn } = await import("./helpers");
      return signIn({ email: "admin@mueqeb.test" });
    })();

    const count = async (
      client: Client,
      table: "orders" | "payments" | "ledger_entries",
      column: string,
    ) => (await client.from(table).select("id").eq(column, order.id)).data?.length ?? 0;

    expect(await count(requester.client, "orders", "id")).toBe(1);
    expect(await count(provider.client, "orders", "id")).toBe(1);
    expect(await count(stranger.client, "orders", "id")).toBe(0);

    expect(await count(requester.client, "payments", "order_id")).toBe(1);
    expect(await count(provider.client, "payments", "order_id")).toBe(0);
    // الحمولة الخام للبوابة لا تُكشف للواجهة
    const raw = await requester.client
      .from("payments")
      .select("raw_webhook")
      .eq("order_id", order.id);
    expect(raw.error).not.toBeNull();

    expect(await count(requester.client, "ledger_entries", "order_id")).toBe(0);
    expect(await count(provider.client, "ledger_entries", "order_id")).toBe(0);
    expect(await count(adminUser, "ledger_entries", "order_id")).toBe(2);

    // المستخدمون لا يستدعون دوال الكتابة المالية
    const forged = await requester.client.rpc("record_payment_result", {
      p_gateway: "mock",
      p_event_id: "x",
      p_provider_ref: ref,
      p_status: "paid",
      p_amount_halalas: 1,
      p_currency: "SAR",
      p_gateway_payment_id: "x",
      p_raw: {},
    });
    expect(forged.error).not.toBeNull();
    const attemptAsUser = await requester.client.rpc("register_payment_attempt", {
      p_order_id: order.id,
      p_gateway: "mock",
      p_provider_ref: "x",
      p_amount_halalas: order.total_paid_halalas,
    });
    expect(attemptAsUser.error).not.toBeNull();
  });

  it("every order in the ledger is balanced, and so is every journal", async () => {
    const { rows: orders } = await db.query(
      "select order_id, sum(debit_halalas) - sum(credit_halalas) as diff from ledger_entries group by order_id",
    );
    expect(orders.length).toBeGreaterThan(0);
    for (const row of orders as { diff: string }[]) expect(Number(row.diff)).toBe(0);

    const { rows: journals } = await db.query(
      "select journal_id from ledger_entries group by journal_id having sum(debit_halalas) <> sum(credit_halalas)",
    );
    expect(journals).toEqual([]);
  });
});
