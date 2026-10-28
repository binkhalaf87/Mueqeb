/**
 * أدوات الإدارة: المؤشرات تطابق الدفتر، صرف المستحقات، تدقيق الإعدادات، الخدمات، الإيقاف.
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

describe.skipIf(!available)("admin operations (local Supabase)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];
  let adminUser: Client;
  let adminId: string;
  let typeId: string;

  beforeAll(async () => {
    await db.connect();
    adminUser = await signIn({ email: "admin@mueqeb.test" });
    adminId = (await adminUser.auth.getUser()).data.user!.id;
    const { data } = await admin
      .from("service_types")
      .select("id")
      .eq("slug", "gosi_add_remove_contributor")
      .single();
    typeId = data!.id;
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
      fee_halalas: 23_456,
      duration_days: 2,
    });
    return { ...user, providerId: provider!.id, city };
  }

  async function makeRequester() {
    const user = await createTestUser(admin, created);
    await user.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الإدارة",
      p_cr_number: randomCr(),
    });
    const { data: account } = await user.client.from("requester_accounts").select("id").single();
    return { ...user, accountId: account!.id };
  }

  /** طلب مكتمل (مستحق للمزوّد) عبر الدورة الكاملة */
  async function completedOrder(provider: Awaited<ReturnType<typeof makeProvider>>) {
    const requester = await makeRequester();
    const { data: requestId } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: requester.accountId,
      p_service_type_id: typeId,
      p_mode: "direct_listed",
      p_target_provider_id: provider.providerId,
      p_city: provider.city,
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
    await requester.client.rpc("confirm_delegation", { p_request_id: requestId! });
    await provider.client.rpc("start_execution", { p_request_id: requestId! });
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
      p_note: "أُنجزت الخدمة",
    });
    const { error } = await requester.client.rpc("confirm_completion", {
      p_request_id: requestId!,
    });
    if (error) throw error;
    return { requester, requestId: requestId!, order: order! };
  }

  describe("dashboard KPIs", () => {
    it("every financial number equals the ledger sums (same snapshot)", async () => {
      // نتأكد من وجود أموال في الضمان (طلب مدفوع لم يكتمل) ومستحقات وصرف
      const provider = await makeProvider(`مدينة-${randomUUID().slice(0, 8)}`);
      await completedOrder(provider);
      const { data: payable } = await admin.rpc("provider_payables");
      const mine = payable!.find((p) => p.provider_id === provider.providerId)!;
      await admin.rpc("record_provider_payout", {
        p_provider_id: provider.providerId,
        p_expected_halalas: mine.outstanding_halalas,
        p_bank_reference: `TRX-${randomUUID().slice(0, 8)}`,
        p_admin_id: adminId,
      });

      await db.query("begin isolation level repeatable read read only");
      try {
        const { rows: k } = await db.query("select public.admin_kpis() as k");
        const kpis = k[0].k;
        const { rows: sums } = await db.query(
          `select account, (sum(debit_halalas) - sum(credit_halalas))::bigint as balance
           from ledger_entries group by account`,
        );
        const balance = (account: string) =>
          Number(sums.find((r: { account: string }) => r.account === account)?.balance ?? 0);

        expect(kpis.revenue_halalas).toBe(balance("platform_revenue"));
        expect(kpis.escrow_halalas).toBe(balance("escrow"));
        expect(kpis.payables_halalas).toBe(balance("provider_payable"));
        expect(kpis.paid_out_halalas).toBe(balance("provider_paid"));
        expect(kpis.paid_out_halalas).toBeGreaterThan(0);
        // الدفتر كله متوازن
        expect(sums.reduce((s: number, r: { balance: string }) => s + Number(r.balance), 0)).toBe(
          0,
        );

        // تفصيل الإيراد: رسم الخدمة + العمولة = إيراد المنصة في الدفتر
        const { rows: fees } = await db.query(
          `select coalesce(sum(least(o.client_fee_halalas, rev.amount)), 0)::bigint as fee
           from (select order_id, sum(debit_halalas) - sum(credit_halalas) as amount
                 from ledger_entries where account = 'platform_revenue' group by order_id) rev
           join orders o on o.id = rev.order_id`,
        );
        expect(kpis.revenue_client_fee_halalas).toBe(Number(fees[0].fee));
        expect(kpis.revenue_client_fee_halalas).toBeLessThanOrEqual(kpis.revenue_halalas);

        // أرصدة الحسابات المعروضة في صفحة الدفتر = المجاميع نفسها
        const { rows: shown } = await db.query("select * from public.ledger_account_balances()");
        for (const row of shown as { account: string; balance_halalas: string }[]) {
          expect(Number(row.balance_halalas)).toBe(balance(row.account));
        }

        const { rows: counts } = await db.query(
          `select (select count(*) from service_requests where published_at is not null)::int as published,
                  (select count(*) from service_requests where status = 'completed')::int as completed,
                  (select count(*) from disputes)::int as disputed`,
        );
        expect(kpis.requests_published).toBe(counts[0].published);
        expect(kpis.requests_completed).toBe(counts[0].completed);
        expect(kpis.requests_disputed).toBe(counts[0].disputed);
      } finally {
        await db.query("rollback");
      }
    });

    it("repeat rate counts establishments with 2+ published requests in 60 days", async () => {
      await db.query("begin isolation level repeatable read read only");
      try {
        const { rows } = await db.query("select public.admin_kpis() as k");
        const { rows: expected } = await db.query(
          `select count(*)::int as base, count(*) filter (where n >= 2)::int as repeat from (
             select r.requester_account_id, count(*) as n from service_requests r
             join requester_accounts a on a.id = r.requester_account_id and a.account_type = 'establishment'
             where r.published_at >= now() - interval '60 days' group by 1) t`,
        );
        const k = rows[0].k;
        expect(k.active_establishments).toBe(expected[0].base);
        expect(k.repeat_establishments).toBe(expected[0].repeat);
        expect(k.repeat_rate_pct).toBe(
          expected[0].base ? Math.round((100 * expected[0].repeat) / expected[0].base) : null,
        );
      } finally {
        await db.query("rollback");
      }
    });

    it("only admins can read KPIs and ledger balances", async () => {
      const requester = await makeRequester();
      expect((await requester.client.rpc("admin_kpis")).error).not.toBeNull();
      expect((await requester.client.rpc("ledger_account_balances")).error).not.toBeNull();
      expect((await requester.client.rpc("provider_payables")).error).not.toBeNull();
      expect((await anonClient().rpc("admin_kpis")).error).not.toBeNull();
      const { data, error } = await adminUser.rpc("admin_kpis");
      expect(error).toBeNull();
      expect(data).toHaveProperty("revenue_halalas");
    });
  });

  describe("payouts", () => {
    it("moves provider_payable → provider_paid per order, balanced, with the bank reference", async () => {
      const provider = await makeProvider(`مدينة-${randomUUID().slice(0, 8)}`);
      const a = await completedOrder(provider);
      const b = await completedOrder(provider);
      const { data: list } = await adminUser.rpc("provider_payables");
      const row = list!.find((p) => p.provider_id === provider.providerId)!;
      expect(row.orders_count).toBe(2);
      const expected = a.order.provider_net_halalas + b.order.provider_net_halalas;
      expect(Number(row.outstanding_halalas)).toBe(expected);

      const stale = await admin.rpc("record_provider_payout", {
        p_provider_id: provider.providerId,
        p_expected_halalas: expected - 1,
        p_bank_reference: "TRX-1",
        p_admin_id: adminId,
      });
      expect(stale.error?.message).toContain("amount_changed");
      const notAdmin = await admin.rpc("record_provider_payout", {
        p_provider_id: provider.providerId,
        p_expected_halalas: expected,
        p_bank_reference: "TRX-1",
        p_admin_id: provider.id,
      });
      expect(notAdmin.error?.message).toContain("forbidden");
      const asUser = await adminUser.rpc("record_provider_payout", {
        p_provider_id: provider.providerId,
        p_expected_halalas: expected,
        p_bank_reference: "TRX-1",
        p_admin_id: adminId,
      });
      expect(asUser.error).not.toBeNull(); // من الخادم بمفتاح الخدمة فقط

      const ref = `TRX-${randomUUID().slice(0, 8)}`;
      const { data: payoutId, error } = await admin.rpc("record_provider_payout", {
        p_provider_id: provider.providerId,
        p_expected_halalas: expected,
        p_bank_reference: ref,
        p_admin_id: adminId,
      });
      expect(error).toBeNull();

      const { rows } = await db.query(
        `select order_id, account, debit_halalas::int as d, credit_halalas::int as c, description
         from ledger_entries where payout_id = $1 order by id`,
        [payoutId],
      );
      expect(rows).toHaveLength(4);
      expect(rows.every((r: { description: string }) => r.description.includes(ref))).toBe(true);
      for (const orderId of [a.order.id, b.order.id]) {
        const { rows: bal } = await db.query(
          `select account, (sum(debit_halalas) - sum(credit_halalas))::int as b
           from ledger_entries where order_id = $1 group by account`,
          [orderId],
        );
        const map = Object.fromEntries(
          bal.map((r: { account: string; b: number }) => [r.account, r.b]),
        );
        expect(map.provider_payable).toBe(0);
        expect(map.provider_paid).toBeGreaterThan(0);
        expect(Object.values(map).reduce((s: number, v) => s + (v as number), 0)).toBe(0);
      }

      const again = await admin.rpc("record_provider_payout", {
        p_provider_id: provider.providerId,
        p_expected_halalas: 0,
        p_bank_reference: "TRX-2",
        p_admin_id: adminId,
      });
      expect(again.error?.message).toContain("nothing_to_pay");

      // المزوّد يرى صرفه فقط؛ وسجل الصرف لا يُعدّل
      expect((await provider.client.from("provider_payouts").select("id")).data).toHaveLength(1);
      const other = await makeProvider(`مدينة-${randomUUID().slice(0, 8)}`);
      expect((await other.client.from("provider_payouts").select("id")).data).toHaveLength(0);
      await expect(
        db.query("delete from provider_payouts where id = $1", [payoutId]),
      ).rejects.toThrow();
    });
  });

  describe("settings audit", () => {
    it("records who changed what, with old and new values; non-admins cannot change", async () => {
      const { data: before } = await admin
        .from("settings")
        .select("value")
        .eq("key", "award_window_hours")
        .single();
      const newValue = Number(before!.value) === 72 ? 96 : 72;
      const { error } = await adminUser
        .from("settings")
        .update({ value: newValue })
        .eq("key", "award_window_hours");
      expect(error).toBeNull();
      try {
        const { data: log } = await adminUser
          .from("admin_audit_log")
          .select("entity, entity_key, old_value, new_value, actor_id")
          .eq("entity_key", "award_window_hours")
          .order("id", { ascending: false })
          .limit(1)
          .single();
        expect(log).toEqual({
          entity: "setting",
          entity_key: "award_window_hours",
          old_value: before!.value,
          new_value: newValue,
          actor_id: adminId,
        });
      } finally {
        await adminUser
          .from("settings")
          .update({ value: before!.value })
          .eq("key", "award_window_hours");
      }

      const requester = await makeRequester();
      await requester.client
        .from("settings")
        .update({ value: 0 })
        .eq("key", "provider_commission_pct");
      const { data: unchanged } = await admin
        .from("settings")
        .select("value")
        .eq("key", "provider_commission_pct")
        .single();
      expect(unchanged!.value).toBe(15);
      expect((await requester.client.from("admin_audit_log").select("id")).data).toHaveLength(0);

      await expect(db.query("delete from admin_audit_log")).rejects.toThrow(
        /audit_log_is_append_only/,
      );
      await expect(db.query("update admin_audit_log set reason = 'x'")).rejects.toThrow(
        /audit_log_is_append_only/,
      );
    });

    it("delegation guide edits are audited", async () => {
      const { data: guide } = await admin
        .from("delegation_guides")
        .select("title")
        .eq("platform", "mc")
        .single();
      await adminUser
        .from("delegation_guides")
        .update({ title: `${guide!.title} ` })
        .eq("platform", "mc");
      await adminUser
        .from("delegation_guides")
        .update({ title: guide!.title })
        .eq("platform", "mc");
      const { data: log } = await adminUser
        .from("admin_audit_log")
        .select("entity, actor_id")
        .eq("entity", "delegation_guide")
        .eq("entity_key", "mc")
        .limit(2);
      expect(log).toHaveLength(2);
      expect(log!.every((l) => l.actor_id === adminId)).toBe(true);
    });
  });

  describe("service types", () => {
    it("admins add and edit types (audited); others cannot; ranges are enforced", async () => {
      const { data: category } = await admin
        .from("service_categories")
        .select("id")
        .eq("slug", "gosi")
        .single();
      const slug = `test_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
      const { error } = await adminUser.from("service_types").insert({
        category_id: category!.id,
        slug,
        name_ar: "خدمة اختبار",
        min_fee_halalas: 10_000,
        guide_min_halalas: 12_000,
        guide_max_halalas: 20_000,
        required_docs: ["هوية"],
        delegation_platform: "none",
        active: false,
      });
      expect(error).toBeNull();
      expect(
        (await adminUser.from("service_types").update({ min_fee_halalas: 11_000 }).eq("slug", slug))
          .error,
      ).toBeNull();

      const bad = await adminUser
        .from("service_types")
        .update({ guide_min_halalas: 5_000 })
        .eq("slug", slug);
      expect(bad.error).not.toBeNull();

      const { data: log } = await adminUser
        .from("admin_audit_log")
        .select("action, old_value, new_value")
        .eq("entity", "service_type")
        .eq("entity_key", slug)
        .order("id");
      expect(log!.map((l) => l.action)).toEqual(["insert", "update"]);
      expect((log![1].old_value as { min_fee_halalas: number }).min_fee_halalas).toBe(10_000);
      expect((log![1].new_value as { min_fee_halalas: number }).min_fee_halalas).toBe(11_000);

      const requester = await makeRequester();
      const denied = await requester.client.from("service_types").insert({
        category_id: category!.id,
        slug: `${slug}_x`,
        name_ar: "x",
        min_fee_halalas: 1,
        guide_min_halalas: 1,
        guide_max_halalas: 1,
      });
      expect(denied.error).not.toBeNull();
    });
  });

  describe("user suspension", () => {
    it("suspends with a reason (audited), hides suspended providers, never suspends admins", async () => {
      const requester = await makeRequester();
      const noReason = await admin.rpc("set_user_suspension", {
        p_profile_id: requester.id,
        p_suspend: true,
        p_reason: "",
        p_admin_id: adminId,
      });
      expect(noReason.error?.message).toContain("reason_required");
      expect(
        (
          await admin.rpc("set_user_suspension", {
            p_profile_id: requester.id,
            p_suspend: true,
            p_reason: "مخالفة شروط الاستخدام",
            p_admin_id: adminId,
          })
        ).error,
      ).toBeNull();
      const { data: profile } = await admin
        .from("profiles")
        .select("suspended_at, suspension_reason, suspended_by")
        .eq("id", requester.id)
        .single();
      expect(profile!.suspended_at).not.toBeNull();
      expect(profile!.suspension_reason).toBe("مخالفة شروط الاستخدام");
      expect(profile!.suspended_by).toBe(adminId);

      const provider = await makeProvider(`مدينة-${randomUUID().slice(0, 8)}`);
      const visible = async () =>
        (
          (await anonClient().rpc("public_provider", { p_provider_id: provider.providerId }))
            .data ?? []
        ).length;
      expect(await visible()).toBe(1);
      await admin.rpc("set_user_suspension", {
        p_profile_id: provider.id,
        p_suspend: true,
        p_reason: "شكاوى متكررة",
        p_admin_id: adminId,
      });
      expect(await visible()).toBe(0);
      await admin.rpc("set_user_suspension", {
        p_profile_id: provider.id,
        p_suspend: false,
        p_reason: "",
        p_admin_id: adminId,
      });
      expect(await visible()).toBe(1);

      const { data: log } = await adminUser
        .from("admin_audit_log")
        .select("action, reason")
        .eq("entity", "user")
        .eq("entity_key", provider.id)
        .order("id");
      expect(log).toEqual([
        { action: "suspend", reason: "شكاوى متكررة" },
        { action: "unsuspend", reason: null },
      ]);

      const adminSuspend = await admin.rpc("set_user_suspension", {
        p_profile_id: adminId,
        p_suspend: true,
        p_reason: "x",
        p_admin_id: adminId,
      });
      expect(adminSuspend.error?.message).toContain("cannot_suspend_admin");
      expect(
        (
          await requester.client.rpc("set_user_suspension", {
            p_profile_id: provider.id,
            p_suspend: true,
            p_reason: "x",
            p_admin_id: adminId,
          })
        ).error,
      ).not.toBeNull();
    });
  });
});
