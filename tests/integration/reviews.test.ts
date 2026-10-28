/**
 * التقييم المتبادل والإحصاءات على Supabase المحلي.
 * معيار القبول: لا تقييم لطلب غير مكتمل، والتقييمات تظهر بالقاعدة المزدوجة.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

function randomCr() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

describe.skipIf(!available)("mutual reviews & stats (local Supabase)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];
  let typeId: string;
  let fee: number;

  beforeAll(async () => {
    await db.connect();
    const { data } = await admin
      .from("service_types")
      .select("id, min_fee_halalas")
      .eq("slug", "gosi_compliance_certificate")
      .single();
    typeId = data!.id;
    fee = data!.min_fee_halalas + 5000;
  });

  afterAll(async () => {
    await db.end();
  });

  async function makeProvider(city: string) {
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
      service_type_id: typeId,
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
      p_establishment_name: "مؤسسة التقييم",
      p_cr_number: randomCr(),
    });
    const { data: account } = await user.client.from("requester_accounts").select("id").single();
    return { ...user, accountId: account!.id };
  }

  /** يأخذ الطلب حتى الحالة المطلوبة (خدمة التأمينات بلا منصة تفويض) */
  async function requestUntil(
    stage: "awaiting_client" | "in_progress" | "delivered" | "completed" | "resolved",
    ctx?: {
      provider: Awaited<ReturnType<typeof makeProvider>>;
      requester: Awaited<ReturnType<typeof makeRequester>>;
      city: string;
    },
  ) {
    const city = ctx?.city ?? `مدينة-${randomUUID().slice(0, 8)}`;
    const provider = ctx?.provider ?? (await makeProvider(city));
    const requester = ctx?.requester ?? (await makeRequester());
    const { data: requestId } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: typeId,
      p_mode: "direct_listed",
      p_target_provider_id: provider.providerId,
      p_city: city,
    });
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
    await admin.rpc("record_payment_result", {
      p_gateway: "mock",
      p_event_id: `evt_${randomUUID()}`,
      p_provider_ref: ref,
      p_status: "paid",
      p_amount_halalas: order!.total_paid_halalas,
      p_currency: "SAR",
      p_gateway_payment_id: ref,
      p_raw: {},
    });
    const result = { provider, requester, requestId: requestId!, order: order!, city };
    if (stage === "awaiting_client") return result;

    await requester.client.rpc("confirm_delegation", { p_request_id: requestId! });
    await provider.client.rpc("start_execution", { p_request_id: requestId! });
    if (stage === "in_progress") return result;

    const path = `${requestId}/delivery_proof/${randomUUID()}.pdf`;
    await provider.client.storage
      .from("request-documents")
      .upload(path, new Blob(["%PDF"], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    await provider.client.from("request_documents").insert({
      request_id: requestId!,
      kind: "delivery_proof",
      label: "إثبات",
      storage_path: path,
      file_name: "p.pdf",
      mime_type: "application/pdf",
      size_bytes: 4,
      uploaded_by: provider.id,
    });
    await provider.client.rpc("submit_delivery", {
      p_request_id: requestId!,
      p_note: "صدرت الشهادة",
    });
    if (stage === "delivered") return result;

    if (stage === "resolved") {
      const adminUser = await signIn({ email: "admin@mueqeb.test" });
      const adminId = (await adminUser.auth.getUser()).data.user!.id;
      await requester.client.rpc("open_dispute", {
        p_request_id: requestId!,
        p_reason: "اعتراض للاختبار",
      });
      await admin.rpc("resolve_dispute", {
        p_request_id: requestId!,
        p_decision: "provider",
        p_refund_halalas: 0,
        p_refund_ref: "",
        p_admin_id: adminId,
        p_note: "",
      });
      return result;
    }
    const { error } = await requester.client.rpc("confirm_completion", {
      p_request_id: requestId!,
    });
    if (error) throw error;
    return result;
  }

  const clientReview = (client: Client, requestId: string, scores = [5, 4, 5], comment?: string) =>
    client.rpc("submit_review", {
      p_request_id: requestId,
      p_speed: scores[0],
      p_accuracy: scores[1],
      p_communication: scores[2],
      p_comment: comment,
    });

  const providerReview = (client: Client, requestId: string, scores = [4, 3]) =>
    client.rpc("submit_review", {
      p_request_id: requestId,
      p_request_clarity: scores[0],
      p_documents_speed: scores[1],
    });

  it("rejects reviews for requests that are not completed (or not paid in-platform)", async () => {
    for (const stage of ["awaiting_client", "in_progress", "delivered", "resolved"] as const) {
      const ctx = await requestUntil(stage);
      const r = await clientReview(ctx.requester.client, ctx.requestId);
      expect(r.error?.message, stage).toContain("not_reviewable");
      const p = await providerReview(ctx.provider.client, ctx.requestId);
      expect(p.error?.message, stage).toContain("not_reviewable");
    }

    // طلب مفتوح (لم يُدفع)
    const requester = await makeRequester();
    const { data: open } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: typeId,
      p_mode: "public",
      p_city: "الرياض",
      p_description: "طلب لم يكتمل بعد",
    });
    expect((await clientReview(requester.client, open!)).error?.message).toContain(
      "not_reviewable",
    );
  });

  it("double-blind: hidden until both review, then revealed together", async () => {
    const ctx = await requestUntil("completed");
    const { requester, provider, requestId } = ctx;

    expect(
      (await clientReview(requester.client, requestId, [5, 4, 5], "خدمة ممتازة وسريعة")).error,
    ).toBeNull();

    // المقيِّم يرى تقييمه؛ الطرف الآخر والعامة لا يرونه بعد
    expect(
      (await requester.client.from("reviews").select("id").eq("request_id", requestId)).data,
    ).toHaveLength(1);
    expect(
      (await provider.client.from("reviews").select("id").eq("request_id", requestId)).data,
    ).toHaveLength(0);
    expect(
      (await anonClient().rpc("provider_reviews", { p_provider_id: provider.providerId })).data,
    ).toHaveLength(0);
    const { data: hiddenStats } = await anonClient().rpc("provider_stats", {
      p_provider_ids: [provider.providerId],
    });
    expect(hiddenStats![0]).toMatchObject({
      reviews_count: 0,
      avg_rating: null,
      completed_orders: 1,
    });

    expect((await providerReview(provider.client, requestId, [4, 2])).error).toBeNull();

    // الآن يظهران معاً للطرفين
    expect(
      (await requester.client.from("reviews").select("reviewer_role").eq("request_id", requestId))
        .data,
    ).toHaveLength(2);
    expect(
      (await provider.client.from("reviews").select("reviewer_role").eq("request_id", requestId))
        .data,
    ).toHaveLength(2);
    const { data: published } = await anonClient().rpc("provider_reviews", {
      p_provider_id: provider.providerId,
    });
    expect(published).toHaveLength(1);
    expect(published![0]).toMatchObject({
      speed: 5,
      accuracy: 4,
      communication: 5,
      comment: "خدمة ممتازة وسريعة",
    });
    expect(published![0]).not.toHaveProperty("reviewer_id");

    const { data: stats } = await anonClient().rpc("provider_stats", {
      p_provider_ids: [provider.providerId],
    });
    expect(stats![0]).toMatchObject({
      reviews_count: 1,
      completed_orders: 1,
      on_time_pct: 100,
      dispute_pct: 0,
    });
    expect(Number(stats![0].avg_rating)).toBeCloseTo(4.67, 2);
    expect(Number(stats![0].avg_speed)).toBe(5);

    // طرف ثالث لا يرى صفوف التقييم الخام
    const stranger = await makeRequester();
    expect(
      (await stranger.client.from("reviews").select("id").eq("request_id", requestId)).data,
    ).toHaveLength(0);
  });

  it("double-blind: revealed after 7 days even if the other party never reviews", async () => {
    const ctx = await requestUntil("completed");
    await providerReview(ctx.provider.client, ctx.requestId, [5, 5]);
    expect(
      (await ctx.requester.client.from("reviews").select("id").eq("request_id", ctx.requestId))
        .data,
    ).toHaveLength(0);

    await db.query(
      "update service_requests set closed_at = now() - interval '6 days 23 hours' where id = $1",
      [ctx.requestId],
    );
    expect(
      (await ctx.requester.client.from("reviews").select("id").eq("request_id", ctx.requestId))
        .data,
    ).toHaveLength(0);

    await db.query(
      "update service_requests set closed_at = now() - interval '7 days 1 minute' where id = $1",
      [ctx.requestId],
    );
    expect(
      (await ctx.requester.client.from("reviews").select("id").eq("request_id", ctx.requestId))
        .data,
    ).toHaveLength(1);
  });

  it("reviews are final: one per side, no update or delete", async () => {
    const ctx = await requestUntil("completed");
    await clientReview(ctx.requester.client, ctx.requestId);
    expect((await clientReview(ctx.requester.client, ctx.requestId)).error?.message).toContain(
      "already_reviewed",
    );

    const upd = await ctx.requester.client
      .from("reviews")
      .update({ speed: 1 })
      .eq("request_id", ctx.requestId);
    expect(upd.error).not.toBeNull();
    await expect(
      db.query("update reviews set speed = 1 where request_id = $1", [ctx.requestId]),
    ).rejects.toThrow(/reviews_are_final/);
    await expect(
      db.query("delete from reviews where request_id = $1", [ctx.requestId]),
    ).rejects.toThrow(/reviews_are_final/);

    // غير الأطراف لا يقيّمون، ولا تُقبل درجات خارج 1–5 أو تعليق فيه وسيلة تواصل
    const stranger = await makeRequester();
    expect((await clientReview(stranger.client, ctx.requestId)).error?.message).toContain(
      "forbidden",
    );
    const ctx2 = await requestUntil("completed");
    expect(
      (await clientReview(ctx2.requester.client, ctx2.requestId, [6, 4, 4])).error,
    ).not.toBeNull();
    expect(
      (await clientReview(ctx2.requester.client, ctx2.requestId, [5, 5, 5], "كلمني 0551234567"))
        .error,
    ).not.toBeNull();
  });

  it("requester stats for providers: rating and completed count only, never identity", async () => {
    const first = await requestUntil("completed");
    await clientReview(first.requester.client, first.requestId);
    await providerReview(first.provider.client, first.requestId, [5, 3]); // متوسط 4.0

    // طلب عام جديد من العميل نفسه، يراه مزوّد مؤهل
    const city = `مدينة-${randomUUID().slice(0, 8)}`;
    const other = await makeProvider(city);
    const { data: openId } = await first.requester.client.rpc("create_service_request", {
      p_requester_account_id: first.requester.accountId,
      p_service_type_id: typeId,
      p_mode: "public",
      p_city: city,
      p_description: "شهادة التزام جديدة",
    });
    const { data, error } = await other.client.rpc("requester_stats_for_request", {
      p_request_id: openId!,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ avg_rating: 4, reviews_count: 1, completed_requests: 1 }]);

    // مزوّد لا يرى الطلب لا يحصل على الإحصاءات
    const outsider = await makeProvider(`مدينة-${randomUUID().slice(0, 8)}`);
    expect(
      (await outsider.client.rpc("requester_stats_for_request", { p_request_id: openId! })).error,
    ).not.toBeNull();
  });

  it("bid comparison carries the provider stats", async () => {
    const done = await requestUntil("completed");
    await clientReview(done.requester.client, done.requestId, [4, 4, 4]);
    await providerReview(done.provider.client, done.requestId);

    const requester = await makeRequester();
    const { data: requestId } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: typeId,
      p_mode: "public",
      p_city: done.city,
      p_description: "شهادة التزام للمنشأة",
    });
    await done.provider.client.rpc("submit_bid", {
      p_request_id: requestId!,
      p_fee_halalas: fee,
      p_expected_gov_fees_halalas: 0,
      p_duration_days: 2,
      p_includes: "إصدار الشهادة",
      p_needs_from_client: "",
    });
    const { data: bids } = await requester.client.rpc("request_bids", { p_request_id: requestId! });
    expect(bids![0]).toMatchObject({
      completed_orders: 1,
      reviews_count: 1,
      on_time_pct: 100,
      dispute_pct: 0,
    });
    expect(Number(bids![0].rating)).toBe(4);

    // متوسط وقت الرد يُحسب من العروض على الطلبات العامة
    const { data: stats } = await anonClient().rpc("provider_stats", {
      p_provider_ids: [done.provider.providerId],
    });
    expect(stats![0].avg_response_minutes).not.toBeNull();
    expect(stats![0].avg_response_minutes).toBeGreaterThanOrEqual(0);
  });

  it("dispute rate is tracked", async () => {
    const disputed = await requestUntil("resolved");
    const done = await requestUntil("completed", {
      provider: disputed.provider,
      requester: disputed.requester,
      city: disputed.city,
    });
    void done;
    const { data } = await anonClient().rpc("provider_stats", {
      p_provider_ids: [disputed.provider.providerId],
    });
    expect(data![0]).toMatchObject({ completed_orders: 2, dispute_pct: 50 });
  });
});
