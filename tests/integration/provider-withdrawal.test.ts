/**
 * اعتذار المكتب عن طلب مُرسى عليه: إلغاء مع استرداد كامل وتسوية متوازنة، ويُحتسب في سجل المكتب.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, databaseAvailable, serviceClient } from "./helpers";

const available = await databaseAvailable();
const DB_URL = process.env.DATABASE_URL ?? "";
const randomCr = () => String(Math.floor(1e9 + Math.random() * 9e9));

describe.skipIf(!available)("provider withdrawal (local Postgres)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  async function awardedRequest() {
    const { data: type } = await admin
      .from("service_types")
      .select("id, min_fee_halalas")
      .eq("slug", "qiwa_work_permit")
      .single();
    const city = `مدينة-${randomUUID().slice(0, 8)}`;
    const providerUser = await createTestUser(admin, created);
    await admin.from("profiles").update({ role: "provider" }).eq("id", providerUser.id);
    const { data: provider } = await admin
      .from("providers")
      .insert({
        profile_id: providerUser.id,
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
      service_type_id: type!.id,
      fee_halalas: type!.min_fee_halalas + 5000,
      duration_days: 3,
    });
    const requester = await createTestUser(admin, created);
    await requester.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الاعتذار",
      p_cr_number: randomCr(),
    });
    const { data: account } = await requester.client
      .from("requester_accounts")
      .select("id")
      .single();
    const { data: requestId } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: account!.id,
      p_service_type_id: type!.id,
      p_mode: "public",
      p_city: city,
    });
    await providerUser.client.rpc("submit_bid", {
      p_request_id: requestId!,
      p_fee_halalas: type!.min_fee_halalas + 1000,
      p_expected_gov_fees_halalas: 0,
      p_duration_days: 3,
      p_includes: "الخدمة كاملة",
      p_needs_from_client: "تفويض قوى",
    });
    const { data: bids } = await requester.client.rpc("request_bids", {
      p_request_id: requestId!,
    });
    await requester.client.rpc("accept_bid", { p_bid_id: bids![0].id });
    return {
      requestId: requestId!,
      requester,
      provider: { ...providerUser, providerId: provider!.id },
    };
  }

  async function pay(requestId: string) {
    const { rows } = await db.query(
      "select id, total_paid_halalas from orders where request_id = $1",
      [requestId],
    );
    const ref = `mock_pay_${randomUUID()}`;
    await admin.rpc("register_payment_attempt", {
      p_order_id: rows[0].id,
      p_gateway: "mock",
      p_provider_ref: ref,
      p_amount_halalas: rows[0].total_paid_halalas,
    });
    await admin.rpc("record_payment_result", {
      p_gateway: "mock",
      p_event_id: `evt_${randomUUID()}`,
      p_provider_ref: ref,
      p_status: "paid",
      p_amount_halalas: rows[0].total_paid_halalas,
      p_currency: "SAR",
      p_gateway_payment_id: ref,
      p_raw: {},
    });
    return { orderId: rows[0].id as string, total: rows[0].total_paid_halalas as number };
  }

  const withdraw = (requestId: string, actorId: string, reason = "تعذّر الوصول لمكتب العمل") =>
    db.query("select public.provider_withdraw($1, $2, $3, $4) as refunded", [
      requestId,
      reason,
      "refund_ref_test",
      actorId,
    ]);

  it("unpaid award: cancels with nothing to refund and records the withdrawal", async () => {
    const { requestId, provider, requester } = await awardedRequest();
    const { rows } = await withdraw(requestId, provider.id);
    expect(rows[0].refunded).toBe(0);

    const { rows: req } = await db.query("select status from service_requests where id = $1", [
      requestId,
    ]);
    expect(req[0].status).toBe("cancelled");

    // العميل يرى الاعتذار وسببه ويصله إشعار
    const { data: seen } = await requester.client
      .from("provider_withdrawals")
      .select("reason, refunded_halalas");
    expect(seen).toEqual([{ reason: "تعذّر الوصول لمكتب العمل", refunded_halalas: 0 }]);
    const { data: notes } = await requester.client
      .from("notifications")
      .select("kind, title")
      .eq("kind", "provider_withdrew");
    expect(notes?.[0]?.title).toBe("اعتذر المكتب عن طلبك");
  });

  it("paid order in progress: full refund, balanced ledger, nothing for the provider", async () => {
    const { requestId, provider, requester } = await awardedRequest();
    const { orderId, total } = await pay(requestId);
    await requester.client.rpc("confirm_delegation", { p_request_id: requestId });
    expect(
      (await provider.client.rpc("start_execution", { p_request_id: requestId })).error,
    ).toBeNull();

    const { rows } = await withdraw(requestId, provider.id);
    expect(rows[0].refunded).toBe(total);

    const { rows: balances } = await db.query(
      "select account, balance_halalas from public.order_ledger_balances($1)",
      [orderId],
    );
    const balance = Object.fromEntries(balances.map((b) => [b.account, Number(b.balance_halalas)]));
    expect(balance.escrow ?? 0).toBe(0);
    expect(balance.provider_payable ?? 0).toBe(0);
    expect(balance.platform_revenue ?? 0).toBe(0);

    const { rows: order } = await db.query(
      "select payment_status, settlement from orders where id = $1",
      [orderId],
    );
    expect(order[0]).toEqual({ payment_status: "refunded", settlement: "provider_withdrawal" });
    const { rows: events } = await db.query(
      `select note from order_events where request_id = $1 and to_status = 'cancelled'`,
      [requestId],
    );
    expect(events[0].note).toContain("اعتذر المكتب");
  });

  it("only the awarded provider, only before delivery, and only with a reason", async () => {
    const { requestId, provider, requester } = await awardedRequest();
    await expect(withdraw(requestId, requester.id)).rejects.toMatchObject({ code: "42501" });
    await expect(withdraw(requestId, provider.id, "لا")).rejects.toMatchObject({ code: "22023" });

    await withdraw(requestId, provider.id);
    // ملغى مسبقاً
    await expect(withdraw(requestId, provider.id)).rejects.toMatchObject({ code: "55000" });
  });

  it("is not callable by users directly, and other providers cannot read it", async () => {
    const { requestId, provider } = await awardedRequest();
    const { error } = await provider.client.rpc(
      "provider_withdraw" as never,
      {
        p_request_id: requestId,
        p_reason: "سبب كافٍ للاعتذار",
        p_refund_ref: "",
        p_actor_id: provider.id,
      } as never,
    );
    expect(error).not.toBeNull();

    await withdraw(requestId, provider.id);
    const other = await createTestUser(admin, created);
    const { data } = await other.client.from("provider_withdrawals").select("request_id");
    expect(data ?? []).toHaveLength(0);
    const { data: own } = await provider.client.from("provider_withdrawals").select("request_id");
    expect(own).toEqual([{ request_id: requestId }]);
  });
});
