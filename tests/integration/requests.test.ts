/**
 * الطلبات والعروض المغلقة وآلة الحالات على Postgres المحلي.
 * كل اختبار يستخدم مدينة فريدة حتى لا يتأثر بمزوّدي seed.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  createTestUser,
  serviceClient,
  databaseAvailable,
  type Client,
} from "./helpers";

const available = await databaseAvailable();

function randomCr() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

describe.skipIf(!available)("requests, sealed bids & state machine (local Postgres)", () => {
  const admin = serviceClient();
  const created: string[] = [];
  let serviceTypeId: string;
  let otherServiceTypeId: string;
  let minFee: number;
  let requiredDocs: string[];

  beforeAll(async () => {
    const { data } = await admin
      .from("service_types")
      .select("id, slug, min_fee_halalas, required_docs")
      .in("slug", ["qiwa_change_occupation", "gosi_compliance_certificate"]);
    const main = data!.find((t) => t.slug === "qiwa_change_occupation")!;
    serviceTypeId = main.id;
    minFee = main.min_fee_halalas;
    requiredDocs = main.required_docs;
    otherServiceTypeId = data!.find((t) => t.slug === "gosi_compliance_certificate")!.id;
  });

  afterAll(async () => {
    // حذف بيانات الاختبار بالترتيب (المفاتيح الأجنبية restrict)
    const { data: accounts } = await admin
      .from("requester_accounts")
      .select("id")
      .in("created_by", created);
    const accountIds = (accounts ?? []).map((a) => a.id);
    if (accountIds.length) {
      const { data: requests } = await admin
        .from("service_requests")
        .select("id")
        .in("requester_account_id", accountIds);
      const requestIds = (requests ?? []).map((r) => r.id);
      if (requestIds.length) {
        // الطلبات المالية تُنشأ تلقائياً عند الترسية (بلا مدفوعات أو قيود في هذه الاختبارات)
        await admin.from("orders").delete().in("request_id", requestIds);
        await admin.from("service_requests").update({ awarded_bid_id: null }).in("id", requestIds);
        await admin.from("bids").delete().in("request_id", requestIds);
        await admin.from("service_requests").delete().in("id", requestIds);
      }
    }
    await admin.from("providers").delete().in("profile_id", created);
    await admin.from("establishment_members").delete().in("user_id", created);
    if (accountIds.length) await admin.from("requester_accounts").delete().in("id", accountIds);
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  /** مزوّد معتمد (أو بحالة أخرى) يقدّم خدمة في مدينة */
  async function makeProvider(
    city: string,
    opts: { serviceId?: string; status?: "approved" | "pending"; fee?: number } = {},
  ) {
    const user = await createTestUser(admin, created);
    await admin.from("profiles").update({ role: "provider" }).eq("id", user.id);
    const { data: provider, error } = await admin
      .from("providers")
      .insert({
        profile_id: user.id,
        office_name: `مكتب ${randomUUID().slice(0, 6)}`,
        cr_number: randomCr(),
        municipal_license_number: "LIC-0001",
        cities: [city],
        verification_status: opts.status ?? "approved",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: svcError } = await admin.from("provider_services").insert({
      provider_id: provider.id,
      service_type_id: opts.serviceId ?? serviceTypeId,
      fee_halalas: opts.fee ?? minFee + 5000,
      duration_days: 4,
      notes: "يشمل المتابعة",
    });
    if (svcError) throw svcError;
    return { ...user, providerId: provider.id };
  }

  async function makeRequester() {
    const user = await createTestUser(admin, created);
    const { error } = await user.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الاختبار",
      p_cr_number: randomCr(),
    });
    if (error) throw error;
    const { data: account } = await user.client.from("requester_accounts").select("id").single();
    return { ...user, accountId: account!.id };
  }

  async function publicRequest(
    requester: { client: Client; accountId: string },
    city: string,
    overrides: Partial<{ description: string; docs: string[]; serviceId: string }> = {},
  ) {
    const { data, error } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: overrides.serviceId ?? serviceTypeId,
      p_mode: "public",
      p_city: city,
      p_urgency: "normal",
      p_description: overrides.description ?? "تعديل مهنة عامل واحد",
      p_available_docs: overrides.docs ?? requiredDocs.slice(0, 1),
      p_private_notes: "رقم المسؤول في الملف الخاص",
    });
    if (error) throw error;
    return data as string;
  }

  function bid(client: Client, requestId: string, fee = minFee + 1000) {
    return client.rpc("submit_bid", {
      p_request_id: requestId,
      p_fee_halalas: fee,
      p_expected_gov_fees_halalas: 10000,
      p_duration_days: 3,
      p_includes: "تنفيذ كامل الخدمة",
      p_needs_from_client: "تفويض في قوى",
    });
  }

  const city = () => `مدينة-${randomUUID().slice(0, 8)}`;

  it("creating a public request goes draft → open with a 24h deadline", async () => {
    const requester = await makeRequester();
    const before = Date.now();
    const id = await publicRequest(requester, city());

    const { data: request } = await requester.client
      .from("service_requests")
      .select("status, bids_deadline, published_at")
      .eq("id", id)
      .single();
    expect(request!.status).toBe("open");
    const deadline = new Date(request!.bids_deadline!).getTime();
    expect(deadline - before).toBeGreaterThan(23.9 * 3600_000);
    expect(deadline - before).toBeLessThan(24.1 * 3600_000);

    const { data: events } = await requester.client
      .from("order_events")
      .select("from_status, to_status, actor_role")
      .eq("request_id", id);
    expect(events).toEqual([{ from_status: "draft", to_status: "open", actor_role: "requester" }]);
  });

  it("only eligible approved providers see an open public request", async () => {
    const c = city();
    const eligible = await makeProvider(c);
    const otherCity = await makeProvider(city());
    const otherService = await makeProvider(c, { serviceId: otherServiceTypeId });
    const pending = await makeProvider(c, { status: "pending" });
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    const visible = async (client: Client) =>
      (await client.from("service_requests").select("id").eq("id", id)).data?.length ?? 0;
    expect(await visible(eligible.client)).toBe(1);
    expect(await visible(otherCity.client)).toBe(0);
    expect(await visible(otherService.client)).toBe(0);
    expect(await visible(pending.client)).toBe(0);
    expect(await visible(anonClient())).toBe(0);

    const { error } = await bid(otherCity.client, id);
    expect(error?.message).toContain("request_not_found");
  });

  it("each provider sees only their own bid — never competitors' bids or counts", async () => {
    const c = city();
    const [a, b, d] = await Promise.all([makeProvider(c), makeProvider(c), makeProvider(c)]);
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    expect((await bid(a.client, id, minFee + 100)).error).toBeNull();
    expect((await bid(b.client, id, minFee + 200)).error).toBeNull();
    expect((await bid(d.client, id, minFee + 300)).error).toBeNull();

    for (const p of [a, b, d]) {
      const { data, count } = await p.client
        .from("bids")
        .select("provider_id, fee_halalas", { count: "exact" })
        .eq("request_id", id);
      expect(count).toBe(1);
      expect(data!.map((x) => x.provider_id)).toEqual([p.providerId]);

      const { error } = await p.client.rpc("request_bids", { p_request_id: id });
      expect(error?.message).toContain("forbidden");
    }

    // العميل يرى العروض الثلاثة مرتبة بالسعر
    const { data: all } = await requester.client.rpc("request_bids", { p_request_id: id });
    expect(all!.map((x) => x.fee_halalas)).toEqual([minFee + 100, minFee + 200, minFee + 300]);
    expect(all![0]).toHaveProperty("office_name");
    expect(all![0]).toHaveProperty("response_minutes");
  });

  it("private details stay hidden from providers until awarded — then only the winner sees them", async () => {
    const c = city();
    const [winner, loser] = await Promise.all([makeProvider(c), makeProvider(c)]);
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    const details = async (client: Client) =>
      (await client.from("request_private_details").select("*").eq("request_id", id)).data ?? [];

    expect(await details(requester.client)).toHaveLength(1);
    expect(await details(winner.client)).toHaveLength(0);

    await bid(winner.client, id);
    await bid(loser.client, id);
    expect(await details(winner.client)).toHaveLength(0);

    const { data: winnerBid } = await winner.client
      .from("bids")
      .select("id")
      .eq("request_id", id)
      .single();
    expect(
      (await requester.client.rpc("accept_bid", { p_bid_id: winnerBid!.id })).error,
    ).toBeNull();

    const winnerView = await details(winner.client);
    expect(winnerView).toHaveLength(1);
    expect(winnerView[0].establishment_name).toBe("مؤسسة الاختبار");
    expect(await details(loser.client)).toHaveLength(0);
  });

  it("enforces the 7-bid limit (withdrawals free a slot)", async () => {
    const c = city();
    const providers = await Promise.all(Array.from({ length: 8 }, () => makeProvider(c)));
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    for (const p of providers.slice(0, 7)) {
      expect((await bid(p.client, id)).error).toBeNull();
    }
    const eighth = await bid(providers[7].client, id);
    expect(eighth.error?.message).toContain("bids_limit_reached");

    // تعديل عرض قائم لا يُحسب عرضاً جديداً
    expect((await bid(providers[0].client, id, minFee + 9999)).error).toBeNull();

    const { data: firstBid } = await providers[0].client
      .from("bids")
      .select("id")
      .eq("request_id", id)
      .single();
    expect(
      (await providers[0].client.rpc("withdraw_bid", { p_bid_id: firstBid!.id })).error,
    ).toBeNull();
    expect((await bid(providers[7].client, id)).error).toBeNull();
  });

  it("concurrent bids cannot exceed the limit", async () => {
    const c = city();
    const providers = await Promise.all(Array.from({ length: 10 }, () => makeProvider(c)));
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    const results = await Promise.all(providers.map((p) => bid(p.client, id)));
    expect(results.filter((r) => r.error === null)).toHaveLength(7);
    const { count } = await admin
      .from("bids")
      .select("id", { count: "exact", head: true })
      .eq("request_id", id)
      .eq("status", "submitted");
    expect(count).toBe(7);
  });

  it("one bid per provider: resubmitting edits the same bid", async () => {
    const c = city();
    const p = await makeProvider(c);
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    const first = await bid(p.client, id, minFee + 100);
    const second = await bid(p.client, id, minFee + 700);
    expect(second.data).toBe(first.data);
    const { data } = await p.client.from("bids").select("fee_halalas").eq("request_id", id);
    expect(data).toEqual([{ fee_halalas: minFee + 700 }]);
  });

  it("rejects bids below the minimum fee, after the deadline, or with contact info", async () => {
    const c = city();
    const p = await makeProvider(c);
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);

    expect((await bid(p.client, id, minFee - 1)).error?.message).toContain("fee_below_minimum");

    const { error: contactError } = await p.client.rpc("submit_bid", {
      p_request_id: id,
      p_fee_halalas: minFee,
      p_expected_gov_fees_halalas: 0,
      p_duration_days: 2,
      p_includes: "تواصل معي على 0551234567",
      p_needs_from_client: "",
    });
    expect(contactError?.message).toContain("contact_info_not_allowed");

    await admin
      .from("service_requests")
      .update({ bids_deadline: new Date(Date.now() - 1000).toISOString() })
      .eq("id", id);
    expect((await bid(p.client, id)).error?.message).toContain("bids_deadline_passed");
  });

  it("rejects contact info in the request description and invalid docs", async () => {
    const requester = await makeRequester();
    await expect(
      publicRequest(requester, city(), { description: "راسلني name@example.com" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("contact_info_not_allowed") });
    await expect(
      publicRequest(requester, city(), { description: "زوروا www.example.sa" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("contact_info_not_allowed") });
    await expect(
      publicRequest(requester, city(), { docs: ["مستند غير مطلوب"] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("invalid_available_docs") });
  });

  it("never accepts requests or bids that mention passwords or OTP codes", async () => {
    const c = city();
    const p = await makeProvider(c);
    const requester = await makeRequester();
    await expect(
      publicRequest(requester, c, { description: "سأرسل لكم كلمة المرور لحساب قوى" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("credentials_not_allowed") });

    const id = await publicRequest(requester, c);
    const { error } = await p.client.rpc("submit_bid", {
      p_request_id: id,
      p_fee_halalas: minFee,
      p_expected_gov_fees_halalas: 0,
      p_duration_days: 2,
      p_includes: "تنفيذ الخدمة",
      p_needs_from_client: "رمز التحقق الذي يصلك على جوالك",
    });
    expect(error?.message).toContain("credentials_not_allowed");
  });

  it("accepting a bid → awarded_unpaid; other bids rejected; everything locked", async () => {
    const c = city();
    const [a, b] = await Promise.all([makeProvider(c), makeProvider(c)]);
    const requester = await makeRequester();
    const id = await publicRequest(requester, c);
    const { data: bidA } = await bid(a.client, id);
    await bid(b.client, id);

    // مزوّد لا يستطيع ترسية الطلب لنفسه
    expect((await a.client.rpc("accept_bid", { p_bid_id: bidA as string })).error).not.toBeNull();

    expect(
      (await requester.client.rpc("accept_bid", { p_bid_id: bidA as string })).error,
    ).toBeNull();

    const { data: request } = await requester.client
      .from("service_requests")
      .select("status, awarded_bid_id")
      .eq("id", id)
      .single();
    expect(request).toEqual({ status: "awarded_unpaid", awarded_bid_id: bidA });

    const { data: own } = await b.client
      .from("bids")
      .select("status")
      .eq("request_id", id)
      .single();
    expect(own!.status).toBe("rejected");

    const { data: events } = await requester.client
      .from("order_events")
      .select("from_status, to_status, actor_role")
      .eq("request_id", id)
      .order("created_at");
    expect(events!.at(-1)).toEqual({
      from_status: "open",
      to_status: "awarded_unpaid",
      actor_role: "requester",
    });

    expect((await bid(b.client, id)).error?.message).toContain("request_not_open");
    expect(
      (await a.client.rpc("withdraw_bid", { p_bid_id: bidA as string })).error?.message,
    ).toContain("bid_locked");
  });

  it("transition_request rejects transitions outside the state machine", async () => {
    const c = city();
    const p = await makeProvider(c);
    const requester = await makeRequester();
    const stranger = await makeRequester();
    const id = await publicRequest(requester, c);

    const t = (client: Client, to: string) =>
      client.rpc("transition_request", { p_request_id: id, p_to: to as "paid" });

    expect((await t(requester.client, "completed")).error?.message).toContain("invalid_transition");
    expect((await t(requester.client, "in_progress")).error?.message).toContain(
      "invalid_transition",
    );
    expect((await t(requester.client, "expired")).error?.message).toContain("forbidden_transition");
    // اختيار بلا عرض غير ممكن
    expect((await t(requester.client, "awarded_unpaid")).error?.message).toContain(
      "no_awarded_bid",
    );
    expect((await t(p.client, "cancelled")).error?.message).toContain("forbidden");
    expect((await t(stranger.client, "cancelled")).error?.message).toContain("forbidden");

    const { data: bidId } = await bid(p.client, id);
    await requester.client.rpc("accept_bid", { p_bid_id: bidId as string });
    // الدفع يحدث من النظام فقط (المرحلة 5)
    expect((await t(requester.client, "paid")).error?.message).toContain("forbidden_transition");

    expect((await t(requester.client, "cancelled")).error).toBeNull();
    expect((await t(requester.client, "open")).error?.message).toContain("invalid_transition");
  });

  it("direct_listed: awarded immediately at the listed price", async () => {
    const c = city();
    const p = await makeProvider(c, { fee: minFee + 2500 });
    const requester = await makeRequester();
    const { data: id, error } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: serviceTypeId,
      p_mode: "direct_listed",
      p_target_provider_id: p.providerId,
      p_city: c,
    });
    expect(error).toBeNull();

    const { data: request } = await requester.client
      .from("service_requests")
      .select("status, bids_deadline")
      .eq("id", id!)
      .single();
    expect(request).toEqual({ status: "awarded_unpaid", bids_deadline: null });

    const { data: bids } = await p.client
      .from("bids")
      .select("fee_halalas, status")
      .eq("request_id", id!);
    expect(bids).toEqual([{ fee_halalas: minFee + 2500, status: "accepted" }]);
    const { data: details } = await p.client
      .from("request_private_details")
      .select("request_id")
      .eq("request_id", id!);
    expect(details).toHaveLength(1);
  });

  it("direct_quote: only the target provider sees and bids", async () => {
    const c = city();
    const [target, other] = await Promise.all([makeProvider(c), makeProvider(c)]);
    const requester = await makeRequester();
    const { data: id } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: serviceTypeId,
      p_mode: "direct_quote",
      p_target_provider_id: target.providerId,
      p_city: c,
      p_description: "أحتاج عرض سعر لثلاثة عمال",
    });

    expect(
      (await other.client.from("service_requests").select("id").eq("id", id!)).data,
    ).toHaveLength(0);
    expect((await bid(other.client, id!)).error?.message).toContain("request_not_found");
    expect(
      (await target.client.from("service_requests").select("id").eq("id", id!)).data,
    ).toHaveLength(1);
    expect((await bid(target.client, id!)).error).toBeNull();
  });

  it("direct requests require an approved provider that offers the service", async () => {
    const c = city();
    const pending = await makeProvider(c, { status: "pending" });
    const requester = await makeRequester();
    const { error } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: serviceTypeId,
      p_mode: "direct_quote",
      p_target_provider_id: pending.providerId,
      p_city: c,
    });
    expect(error?.message).toContain("provider_does_not_offer_service");
  });

  it("users cannot write requests or bids directly", async () => {
    const requester = await makeRequester();
    const { error } = await requester.client.from("service_requests").insert({
      requester_account_id: requester.accountId,
      service_type_id: serviceTypeId,
      mode: "public",
      city: "الرياض",
      created_by: requester.id,
    });
    expect(error).not.toBeNull();

    const id = await publicRequest(requester, city());
    const { error: updateError } = await requester.client
      .from("service_requests")
      .update({ status: "paid" })
      .eq("id", id);
    expect(updateError).not.toBeNull();
  });

  it("scheduled expiry: no bids after the deadline, or no choice after the award window", async () => {
    const c = city();
    const p = await makeProvider(c);
    const requester = await makeRequester();
    const noBids = await publicRequest(requester, c);
    const withBids = await publicRequest(requester, c);
    await bid(p.client, withBids);

    const past = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
    await admin
      .from("service_requests")
      .update({ bids_deadline: past(1) })
      .in("id", [noBids, withBids]);

    // المهمة المجدولة تعمل كـ system (بلا مستخدم)
    expect((await admin.rpc("expire_stale_requests")).error).toBeNull();
    const status = async (id: string) =>
      (await admin.from("service_requests").select("status").eq("id", id).single()).data!.status;
    expect(await status(noBids)).toBe("expired");
    expect(await status(withBids)).toBe("open");

    await admin
      .from("service_requests")
      .update({ bids_deadline: past(73) })
      .eq("id", withBids);
    await admin.rpc("expire_stale_requests");
    expect(await status(withBids)).toBe("expired");
    const { data: b } = await p.client
      .from("bids")
      .select("status")
      .eq("request_id", withBids)
      .single();
    expect(b!.status).toBe("rejected");

    const { data: events } = await admin
      .from("order_events")
      .select("to_status, actor_role, actor_id")
      .eq("request_id", noBids)
      .eq("to_status", "expired");
    expect(events).toEqual([{ to_status: "expired", actor_role: "system", actor_id: null }]);

    // المستخدمون لا يستدعون مهمة الانتهاء
    expect((await requester.client.rpc("expire_stale_requests")).error).not.toBeNull();
  });
});
