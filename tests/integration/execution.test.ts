/**
 * دورة التنفيذ بعد الدفع: التفويض، المستندات، التنفيذ والتسليم، الإكمال، النزاع، الإلغاء بعد البدء،
 * المهام المجدولة، والمحادثة — مع التحقق من توازن الدفتر في كل حالة.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcOrderAmounts, roundBps } from "@/lib/payments/amounts";
import {
  anonClient,
  createTestUser,
  serviceClient,
  signIn,
  supabaseAvailable,
  type Client,
} from "./helpers";

const available = await supabaseAvailable();
const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const BUCKET = "request-documents";

function randomCr() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

const pdf = () => new Blob(["%PDF-1.4 test"], { type: "application/pdf" });

describe.skipIf(!available)("execution, delivery, disputes & chat (local Supabase)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];
  let qiwaType: { id: string; min_fee_halalas: number };
  let adminUser: Client;
  let adminId: string;

  beforeAll(async () => {
    await db.connect();
    const { data } = await admin
      .from("service_types")
      .select("id, min_fee_halalas")
      .eq("slug", "qiwa_work_permit")
      .single();
    qiwaType = data!;
    adminUser = await signIn({ email: "admin@mueqeb.test" });
    adminId = (await adminUser.auth.getUser()).data.user!.id;
  });

  afterAll(async () => {
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
      service_type_id: qiwaType.id,
      fee_halalas: fee,
      duration_days: 3,
    });
    return { ...user, providerId: provider!.id };
  }

  async function makeRequester() {
    const user = await createTestUser(admin, created);
    await user.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة التنفيذ",
      p_cr_number: randomCr(),
    });
    const { data: account } = await user.client.from("requester_accounts").select("id").single();
    return { ...user, accountId: account!.id };
  }

  /** طلب مباشر بالسعر المعلن، مدفوع → awaiting_client */
  async function paidRequest(fee = qiwaType.min_fee_halalas + 7777) {
    const city = `مدينة-${randomUUID().slice(0, 8)}`;
    const provider = await makeProvider(city, fee);
    const requester = await makeRequester();
    const { data: requestId, error } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: qiwaType.id,
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
    const ref = `mock_pay_${randomUUID()}`;
    await admin.rpc("register_payment_attempt", {
      p_order_id: order!.id,
      p_gateway: "mock",
      p_provider_ref: ref,
      p_amount_halalas: order!.total_paid_halalas,
    });
    const { data: outcome } = await admin.rpc("record_payment_result", {
      p_gateway: "mock",
      p_event_id: `evt_${randomUUID()}`,
      p_provider_ref: ref,
      p_status: "paid",
      p_amount_halalas: order!.total_paid_halalas,
      p_currency: "SAR",
      p_gateway_payment_id: ref,
      p_raw: {},
    });
    expect(outcome).toBe("processed");
    return { provider, requester, requestId: requestId!, order: order!, city };
  }

  async function uploadDoc(
    client: Client,
    requestId: string,
    kind: "client_document" | "delivery_proof",
    userId: string,
  ) {
    const path = `${requestId}/${kind}/${randomUUID()}.pdf`;
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(path, pdf(), { contentType: "application/pdf" });
    if (uploadError) return { error: uploadError, path };
    const { error } = await client.from("request_documents").insert({
      request_id: requestId,
      kind,
      label: kind === "client_document" ? "صورة إقامة العامل" : "إثبات الإنجاز",
      storage_path: path,
      file_name: "doc.pdf",
      mime_type: "application/pdf",
      size_bytes: 13,
      uploaded_by: userId,
    });
    return { error, path };
  }

  /** من الدفع حتى التسليم */
  async function deliveredRequest(fee?: number) {
    const ctx = await paidRequest(fee);
    await ctx.requester.client.rpc("confirm_delegation", { p_request_id: ctx.requestId });
    expect(
      (await ctx.provider.client.rpc("start_execution", { p_request_id: ctx.requestId })).error,
    ).toBeNull();
    await uploadDoc(ctx.provider.client, ctx.requestId, "delivery_proof", ctx.provider.id);
    const { error } = await ctx.provider.client.rpc("submit_delivery", {
      p_request_id: ctx.requestId,
      p_note: "صدرت رخصة العمل وأُرفق إثباتها",
    });
    expect(error).toBeNull();
    return ctx;
  }

  async function balances(orderId: string) {
    const { rows } = await db.query(
      "select account, (sum(debit_halalas) - sum(credit_halalas))::int as balance from ledger_entries where order_id = $1 group by account",
      [orderId],
    );
    return Object.fromEntries(
      (rows as { account: string; balance: number }[]).map((r) => [r.account, r.balance]),
    );
  }

  async function status(requestId: string) {
    return (await admin.from("service_requests").select("status").eq("id", requestId).single())
      .data!.status;
  }

  function expectBalanced(b: Record<string, number>) {
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBe(0);
    expect(b.escrow ?? 0).toBe(0);
  }

  it("happy path: delegation → documents → in_progress → delivered → completed, ledger settled", async () => {
    const fee = qiwaType.min_fee_halalas + 7777;
    const { provider, requester, requestId, order, city } = await paidRequest(fee);
    expect(await status(requestId)).toBe("awaiting_client");

    // المزوّد لا يبدأ قبل تأكيد التفويض (خدمة قوى)
    const early = await provider.client.rpc("start_execution", { p_request_id: requestId });
    expect(early.error?.message).toContain("delegation_not_confirmed");
    expect(
      (await requester.client.rpc("confirm_delegation", { p_request_id: requestId })).error,
    ).toBeNull();

    // مستند العميل: يراه المزوّد المُرسى عليه فقط
    const doc = await uploadDoc(requester.client, requestId, "client_document", requester.id);
    expect(doc.error).toBeNull();
    const other = await makeProvider(city, fee);
    expect(
      (await provider.client.from("request_documents").select("id").eq("request_id", requestId))
        .data,
    ).toHaveLength(1);
    expect((await provider.client.storage.from(BUCKET).download(doc.path)).data).not.toBeNull();
    expect(
      (await other.client.from("request_documents").select("id").eq("request_id", requestId)).data,
    ).toHaveLength(0);
    expect((await other.client.storage.from(BUCKET).download(doc.path)).data).toBeNull();
    expect((await anonClient().storage.from(BUCKET).download(doc.path)).data).toBeNull();
    // المزوّد لا يرفع «مستند عميل»
    expect(
      (await uploadDoc(provider.client, requestId, "client_document", provider.id)).error,
    ).not.toBeNull();

    expect(
      (await provider.client.rpc("start_execution", { p_request_id: requestId })).error,
    ).toBeNull();
    const { data: started } = await admin
      .from("service_requests")
      .select("status, started_at, due_at")
      .eq("id", requestId)
      .single();
    expect(started!.status).toBe("in_progress");
    expect(new Date(started!.due_at!).getTime() - new Date(started!.started_at!).getTime()).toBe(
      3 * 86_400_000,
    );

    // التسليم يتطلب إثباتاً
    const noProof = await provider.client.rpc("submit_delivery", {
      p_request_id: requestId,
      p_note: "تم التنفيذ",
    });
    expect(noProof.error?.message).toContain("delivery_proof_required");
    expect(
      (await uploadDoc(provider.client, requestId, "delivery_proof", provider.id)).error,
    ).toBeNull();
    // العميل لا يسلّم بدلاً من المزوّد
    expect(
      (
        await requester.client.rpc("submit_delivery", {
          p_request_id: requestId,
          p_note: "تم التنفيذ",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await provider.client.rpc("submit_delivery", {
          p_request_id: requestId,
          p_note: "صدرت الرخصة",
        })
      ).error,
    ).toBeNull();
    expect(await status(requestId)).toBe("delivered");

    // المزوّد لا يؤكد الإنجاز بنفسه
    expect(
      (await provider.client.rpc("confirm_completion", { p_request_id: requestId })).error,
    ).not.toBeNull();
    expect(
      (await requester.client.rpc("confirm_completion", { p_request_id: requestId })).error,
    ).toBeNull();
    expect(await status(requestId)).toBe("completed");

    const a = calcOrderAmounts(fee, order.client_fee_bps, order.provider_commission_bps);
    const b = await balances(order.id);
    expectBalanced(b);
    expect(b).toEqual({
      client: -a.totalPaidHalalas,
      escrow: 0,
      platform_revenue: a.platformRevenueHalalas,
      provider_payable: a.providerNetHalalas,
    });
    const { data: settled } = await admin
      .from("orders")
      .select("settlement, provider_payable_halalas, platform_revenue_halalas, payment_status")
      .eq("id", order.id)
      .single();
    expect(settled).toEqual({
      settlement: "completed",
      provider_payable_halalas: a.providerNetHalalas,
      platform_revenue_halalas: a.platformRevenueHalalas,
      payment_status: "paid",
    });
  });

  it("dispute with a partial refund: refund taken from the provider fee, ledger balanced", async () => {
    const fee = 20_000;
    const { requester, requestId, order } = await deliveredRequest(fee);
    const reasonless = await requester.client.rpc("open_dispute", {
      p_request_id: requestId,
      p_reason: "",
    });
    expect(reasonless.error?.message).toContain("reason_required");
    expect(
      (
        await requester.client.rpc("open_dispute", {
          p_request_id: requestId,
          p_reason: "صدرت رخصة واحدة من اثنتين",
        })
      ).error,
    ).toBeNull();
    expect(await status(requestId)).toBe("disputed");

    // أكثر من الأتعاب (ليس استرداداً كاملاً) مرفوض
    const tooMuch = await admin.rpc("resolve_dispute", {
      p_request_id: requestId,
      p_decision: "partial_refund",
      p_refund_halalas: fee + 1,
      p_refund_ref: "rf_x",
      p_admin_id: adminId,
      p_note: "",
    });
    expect(tooMuch.error?.message).toContain("invalid_refund_amount");
    // غير المدير لا يقرر
    const notAdmin = await admin.rpc("resolve_dispute", {
      p_request_id: requestId,
      p_decision: "provider",
      p_refund_halalas: 0,
      p_refund_ref: "",
      p_admin_id: requester.id,
      p_note: "",
    });
    expect(notAdmin.error?.message).toContain("forbidden");

    const refund = 7_550; // 75.50 ر.س
    const { error } = await admin.rpc("resolve_dispute", {
      p_request_id: requestId,
      p_decision: "partial_refund",
      p_refund_halalas: refund,
      p_refund_ref: "rf_partial",
      p_admin_id: adminId,
      p_note: "إنجاز جزئي",
    });
    expect(error).toBeNull();
    expect(await status(requestId)).toBe("resolved");

    const kept = fee - refund;
    const commission = roundBps(kept, order.provider_commission_bps);
    const b = await balances(order.id);
    expectBalanced(b);
    expect(b).toEqual({
      client: -(order.total_paid_halalas - refund),
      escrow: 0,
      platform_revenue: order.client_fee_halalas + commission,
      provider_payable: kept - commission,
    });

    const { data: o } = await admin
      .from("orders")
      .select("payment_status, refunded_halalas, settlement")
      .eq("id", order.id)
      .single();
    expect(o).toEqual({
      payment_status: "partially_refunded",
      refunded_halalas: refund,
      settlement: "dispute_partial_refund",
    });
    const { data: events } = await admin
      .from("order_events")
      .select("to_status, actor_role, actor_id")
      .eq("request_id", requestId)
      .eq("to_status", "resolved");
    expect(events).toEqual([{ to_status: "resolved", actor_role: "admin", actor_id: adminId }]);
  });

  it("dispute decided for the provider settles like a completion; full refund returns everything", async () => {
    const forProvider = await deliveredRequest();
    await forProvider.requester.client.rpc("open_dispute", {
      p_request_id: forProvider.requestId,
      p_reason: "تأخر التسليم",
    });
    await admin.rpc("resolve_dispute", {
      p_request_id: forProvider.requestId,
      p_decision: "provider",
      p_refund_halalas: 0,
      p_refund_ref: "",
      p_admin_id: adminId,
      p_note: "",
    });
    const b1 = await balances(forProvider.order.id);
    expectBalanced(b1);
    expect(b1.provider_payable).toBe(forProvider.order.provider_net_halalas);

    const full = await deliveredRequest();
    await full.requester.client.rpc("open_dispute", {
      p_request_id: full.requestId,
      p_reason: "لم تُنجز الخدمة",
    });
    await admin.rpc("resolve_dispute", {
      p_request_id: full.requestId,
      p_decision: "full_refund",
      p_refund_halalas: 0,
      p_refund_ref: "rf_full",
      p_admin_id: adminId,
      p_note: "",
    });
    const b2 = await balances(full.order.id);
    expectBalanced(b2);
    expect(b2.client).toBe(0);
    expect(b2.provider_payable ?? 0).toBe(0);
    expect(b2.platform_revenue ?? 0).toBe(0);
  });

  it("cancellation after start keeps the configured share of the fee for the provider", async () => {
    const fee = 33_333;
    const ctx = await paidRequest(fee);
    await ctx.requester.client.rpc("confirm_delegation", { p_request_id: ctx.requestId });
    await ctx.provider.client.rpc("start_execution", { p_request_id: ctx.requestId });

    // لا إغلاق دون تسوية الضمان
    const direct = await admin.rpc("transition_request", {
      p_request_id: ctx.requestId,
      p_to: "cancelled",
    });
    expect(direct.error?.message).toContain("settlement_required");
    // المستخدم لا يستدعي الإلغاء المالي مباشرة
    const asUser = await ctx.requester.client.rpc("cancel_after_start", {
      p_request_id: ctx.requestId,
      p_refund_ref: "x",
      p_actor_id: ctx.requester.id,
    });
    expect(asUser.error).not.toBeNull();

    const { data: preview } = await ctx.requester.client.rpc("cancellation_after_start_refund", {
      p_request_id: ctx.requestId,
    });
    const kept = roundBps(fee, 3000); // 30% افتراضياً
    expect(preview).toBe(fee - kept);

    const { data: refund, error } = await admin.rpc("cancel_after_start", {
      p_request_id: ctx.requestId,
      p_refund_ref: "rf_cancel",
      p_actor_id: ctx.requester.id,
    });
    expect(error).toBeNull();
    expect(refund).toBe(fee - kept);
    expect(await status(ctx.requestId)).toBe("cancelled");

    const commission = roundBps(kept, ctx.order.provider_commission_bps);
    const b = await balances(ctx.order.id);
    expectBalanced(b);
    expect(b.provider_payable).toBe(kept - commission);
    expect(b.platform_revenue).toBe(ctx.order.client_fee_halalas + commission);
  });

  it("before start, cancellation is a full refund (phase 4) and marks the order settled", async () => {
    const ctx = await paidRequest();
    const { data: payment } = await admin
      .from("payments")
      .select("id")
      .eq("order_id", ctx.order.id)
      .eq("status", "paid")
      .single();
    const { error } = await admin.rpc("record_refund", {
      p_payment_id: payment!.id,
      p_refund_ref: "rf_before",
      p_amount_halalas: ctx.order.total_paid_halalas,
      p_raw: {},
      p_cancel_request: true,
    });
    expect(error).toBeNull();
    expect(await status(ctx.requestId)).toBe("cancelled");
    expectBalanced(await balances(ctx.order.id));
  });

  it("scheduled job: auto-completes after 3 days without response, and flags late execution", async () => {
    const delivered = await deliveredRequest();
    const late = await paidRequest();
    await late.requester.client.rpc("confirm_delegation", { p_request_id: late.requestId });
    await late.provider.client.rpc("start_execution", { p_request_id: late.requestId });

    await db.query(
      "update service_requests set delivered_at = now() - interval '2 days' where id = $1",
      [delivered.requestId],
    );
    await db.query("update service_requests set due_at = now() - interval '1 hour' where id = $1", [
      late.requestId,
    ]);
    await db.query("select public.run_order_maintenance()");
    expect(await status(delivered.requestId)).toBe("delivered");

    await db.query(
      "update service_requests set delivered_at = now() - interval '3 days 1 minute' where id = $1",
      [delivered.requestId],
    );
    const { rows } = await db.query("select public.run_order_maintenance() as r");
    expect(rows[0].r.auto_completed).toBeGreaterThanOrEqual(1);
    expect(await status(delivered.requestId)).toBe("completed");
    expectBalanced(await balances(delivered.order.id));
    const { data: ev } = await admin
      .from("order_events")
      .select("actor_role")
      .eq("request_id", delivered.requestId)
      .eq("to_status", "completed")
      .single();
    expect(ev!.actor_role).toBe("system");

    const { data: flagged } = await admin
      .from("service_requests")
      .select("is_late")
      .eq("id", late.requestId)
      .single();
    expect(flagged!.is_late).toBe(true);
    const { data: perf } = await anonClient().rpc("provider_stats", {
      p_provider_ids: [late.provider.providerId],
    });
    expect(perf![0].late_orders).toBe(1);

    // المستخدمون لا يستدعون المهمة
    expect((await late.requester.client.rpc("run_order_maintenance")).error).not.toBeNull();
  });

  describe("chat", () => {
    it("masks contact info before award, rejects credential requests and logs them, isolates threads", async () => {
      const city = `مدينة-${randomUUID().slice(0, 8)}`;
      const [p1, p2] = await Promise.all([makeProvider(city, 20_000), makeProvider(city, 20_000)]);
      const requester = await makeRequester();
      const { data: requestId } = await requester.client.rpc("create_service_request", {
        p_requester_account_id: requester.accountId,
        p_service_type_id: qiwaType.id,
        p_mode: "public",
        p_city: city,
        p_description: "إصدار رخصة عمل لعامل جديد",
      });
      for (const p of [p1, p2]) {
        await p.client.rpc("submit_bid", {
          p_request_id: requestId!,
          p_fee_halalas: 20_000,
          p_expected_gov_fees_halalas: 0,
          p_duration_days: 2,
          p_includes: "إصدار الرخصة",
          p_needs_from_client: "",
        });
      }

      const masked = await p1.client.rpc("send_message", {
        p_request_id: requestId!,
        p_provider_id: p1.providerId,
        p_body: "تواصل معي على 0551234567 أو mail@office.sa",
      });
      expect(masked.data).toMatchObject({ status: "masked" });
      const { data: thread } = await requester.client
        .from("messages")
        .select("body, was_masked")
        .eq("request_id", requestId!)
        .eq("provider_id", p1.providerId);
      expect(thread).toEqual([{ body: "تواصل معي على [محجوب] أو [محجوب]", was_masked: true }]);

      // المزوّد الآخر لا يرى خيط منافسه، ولا يكتب فيه
      expect(
        (await p2.client.from("messages").select("id").eq("request_id", requestId!)).data,
      ).toHaveLength(0);
      const intrude = await p2.client.rpc("send_message", {
        p_request_id: requestId!,
        p_provider_id: p1.providerId,
        p_body: "مرحبا",
      });
      expect(intrude.error?.message).toContain("forbidden");

      // طلب رمز تحقق: يُرفض ويُسجّل للإدارة
      const asked = await p1.client.rpc("send_message", {
        p_request_id: requestId!,
        p_provider_id: p1.providerId,
        p_body: "أرسل لي رمز التحقق الذي وصلك من أبشر",
      });
      expect(asked.data).toMatchObject({ status: "blocked" });
      expect(
        (await requester.client.from("messages").select("id").eq("request_id", requestId!)).data,
      ).toHaveLength(1);
      const { data: logged } = await adminUser
        .from("blocked_messages")
        .select("matched_term, body")
        .eq("request_id", requestId!);
      expect(logged).toEqual([
        { matched_term: "رمز التحقق", body: "أرسل لي رمز التحقق الذي وصلك من أبشر" },
      ]);
      expect((await requester.client.from("blocked_messages").select("id")).data).toHaveLength(0);

      // قائمة الكلمات قابلة للتعديل
      await db.query(
        `update settings set value = value || '["كلمة الدخول"]'::jsonb where key = 'chat_blocked_terms'`,
      );
      try {
        const custom = await requester.client.rpc("send_message", {
          p_request_id: requestId!,
          p_provider_id: p1.providerId,
          p_body: "هذه كلمة الدخول لحسابي",
        });
        expect(custom.data).toMatchObject({ status: "blocked", term: "كلمة الدخول" });
      } finally {
        await db.query(
          `update settings set value = value - 'كلمة الدخول' where key = 'chat_blocked_terms'`,
        );
      }
    });

    it("after award and payment the awarded thread is not masked; closed threads reject messages", async () => {
      const ctx = await paidRequest();
      const sent = await ctx.requester.client.rpc("send_message", {
        p_request_id: ctx.requestId,
        p_provider_id: ctx.provider.providerId,
        p_body: "رقمي للتنسيق 0551234567",
      });
      expect(sent.data).toMatchObject({ status: "sent" });
      const { data } = await ctx.provider.client
        .from("messages")
        .select("body")
        .eq("request_id", ctx.requestId);
      expect(data).toEqual([{ body: "رقمي للتنسيق 0551234567" }]);

      const { data: payment } = await admin
        .from("payments")
        .select("id")
        .eq("order_id", ctx.order.id)
        .eq("status", "paid")
        .single();
      await admin.rpc("record_refund", {
        p_payment_id: payment!.id,
        p_refund_ref: "rf",
        p_amount_halalas: ctx.order.total_paid_halalas,
        p_raw: {},
        p_cancel_request: true,
      });
      const closed = await ctx.requester.client.rpc("send_message", {
        p_request_id: ctx.requestId,
        p_provider_id: ctx.provider.providerId,
        p_body: "مرحبا",
      });
      expect(closed.error?.message).toContain("thread_closed");
    });
  });

  it("delegation guides: readable, editable by admin only, never asking for credentials", async () => {
    const requester = await makeRequester();
    const { data: guides } = await requester.client
      .from("delegation_guides")
      .select("platform, steps");
    expect(guides!.map((g) => g.platform).sort()).toEqual(["balady", "mc", "none", "qiwa"]);

    await requester.client
      .from("delegation_guides")
      .update({ title: "تعديل" })
      .eq("platform", "qiwa");
    const { data: unchanged } = await admin
      .from("delegation_guides")
      .select("title")
      .eq("platform", "qiwa")
      .single();
    expect(unchanged!.title).not.toBe("تعديل");

    const original = guides!.find((g) => g.platform === "qiwa")!.steps;
    const bad = await adminUser
      .from("delegation_guides")
      .update({ steps: [...original, "أرسل لنا كلمة المرور"] })
      .eq("platform", "qiwa");
    expect(bad.error).not.toBeNull();
    const ok = await adminUser
      .from("delegation_guides")
      .update({ steps: original, updated_at: new Date().toISOString() })
      .eq("platform", "qiwa");
    expect(ok.error).toBeNull();
  });

  it("the whole ledger stays balanced per order and per journal", async () => {
    const { rows } = await db.query(
      "select order_id from ledger_entries group by order_id having sum(debit_halalas) <> sum(credit_halalas)",
    );
    expect(rows).toEqual([]);
    const { rows: escrow } = await db.query(
      `select o.id from orders o join service_requests r on r.id = o.request_id
       where r.status in ('completed','resolved','cancelled')
         and coalesce((select sum(debit_halalas) - sum(credit_halalas) from ledger_entries l
                       where l.order_id = o.id and l.account = 'escrow'), 0) <> 0`,
    );
    expect(escrow).toEqual([]);
  });
});
