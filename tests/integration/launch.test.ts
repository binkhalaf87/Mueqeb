/**
 * الجاهزية للإطلاق: رموز البريد ذات الاستخدام الواحد، تأكيد البريد، استعادة كلمة المرور،
 * وانتهاء مهلة الدفع للطلبات المرساة غير المدفوعة.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON, asUser, dbFor } from "@/lib/db/core";
import {
  changeEmail,
  changePassword,
  contactStatus,
  markEmailVerified,
  verifyCredentials,
} from "@/lib/auth/accounts";
import { consumeToken, isTokenValid, issueToken } from "@/lib/auth/one-time-tokens";
import { createTestUser, databaseAvailable, serviceClient } from "./helpers";

const available = await databaseAvailable();
const DB_URL = process.env.DATABASE_URL ?? "";
const randomCr = () => String(Math.floor(1e9 + Math.random() * 9e9));

describe.skipIf(!available)("launch readiness (local Postgres)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
    await db.end();
  });

  async function emailOf(userId: string) {
    return (await contactStatus(userId))!.email!;
  }

  it("a reset token works once, and only the newest one", async () => {
    const user = await createTestUser(admin, created);
    const email = await emailOf(user.id);
    const first = await issueToken(user.id, "password_reset", email);
    const second = await issueToken(user.id, "password_reset", email);

    // الأقدم يبطل بإصدار الأحدث
    expect(await isTokenValid(first, "password_reset")).toBe(false);
    expect(await isTokenValid(second, "password_reset")).toBe(true);
    // الغرض جزء من الرمز
    expect(await consumeToken(second, "email_verify")).toBeNull();

    const owner = await consumeToken(second, "password_reset");
    expect(owner).toEqual({ userId: user.id, email });
    expect(await consumeToken(second, "password_reset")).toBeNull();

    await changePassword(user.id, "NewPassword#2026");
    expect(await verifyCredentials({ kind: "email", email }, "NewPassword#2026")).toBe(user.id);
  });

  it("expired, malformed, or stale-email tokens are rejected", async () => {
    const user = await createTestUser(admin, created);
    const email = await emailOf(user.id);

    const expired = await issueToken(user.id, "password_reset", email);
    await db.query(
      "update auth.one_time_tokens set expires_at = now() - interval '1 minute' where user_id = $1",
      [user.id],
    );
    expect(await consumeToken(expired, "password_reset")).toBeNull();
    expect(await consumeToken("not-a-token", "password_reset")).toBeNull();

    // رابط أُرسل للبريد القديم يبطل بعد تغيير البريد
    const verify = await issueToken(user.id, "email_verify", email);
    await changeEmail(user.id, `changed-${randomUUID()}@mueqeb.test`);
    expect(await consumeToken(verify, "email_verify")).toBeNull();
  });

  it("verifying the email marks the contact verified; changing it resets that", async () => {
    const user = await createTestUser(admin, created);
    const email = await emailOf(user.id);
    expect((await contactStatus(user.id))!.emailVerified).toBe(false);

    const token = await issueToken(user.id, "email_verify", email);
    const owner = (await consumeToken(token, "email_verify"))!;
    expect(await markEmailVerified(owner.userId, owner.email)).toBe(true);
    expect((await contactStatus(user.id))!.emailVerified).toBe(true);

    // إعادة حفظ البريد نفسه لا تُلغي التأكيد، وبريد جديد يُلغيه
    await changeEmail(user.id, email);
    expect((await contactStatus(user.id))!.emailVerified).toBe(true);
    await changeEmail(user.id, `new-${randomUUID()}@mueqeb.test`);
    expect((await contactStatus(user.id))!.emailVerified).toBe(false);
  });

  it("tokens are unreadable to anyone but the server", async () => {
    const user = await createTestUser(admin, created);
    await issueToken(user.id, "password_reset", await emailOf(user.id));
    for (const actor of [ANON, asUser(user.id)]) {
      await expect(dbFor(actor).query("select * from auth.one_time_tokens")).rejects.toMatchObject({
        code: "42501",
      });
    }
  });

  describe("unpaid award expiry", () => {
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
        p_establishment_name: "مؤسسة المهلة",
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
      expect(
        (await requester.client.rpc("accept_bid", { p_bid_id: bids![0].id })).error,
      ).toBeNull();
      return { requestId: requestId!, requester, provider: providerUser };
    }

    const status = async (id: string) =>
      (await db.query("select status from service_requests where id = $1", [id])).rows[0].status;
    const backdate = (id: string, hours: number) =>
      db.query(
        `update orders set created_at = now() - make_interval(hours => $2) where request_id = $1`,
        [id, hours],
      );

    it("expires after the payment window and notifies both parties", async () => {
      const { requestId, requester, provider } = await awardedRequest();
      await db.query("select public.expire_unpaid_awards()");
      expect(await status(requestId)).toBe("awarded_unpaid");

      await backdate(requestId, 49);
      await db.query("select public.expire_unpaid_awards()");
      expect(await status(requestId)).toBe("expired");

      for (const party of [requester, provider]) {
        const { data } = await party.client
          .from("notifications")
          .select("kind, title")
          .eq("kind", "expired");
        expect(data?.[0]?.title).toMatch(/انتهت مهلة (الدفع|دفع طلب)/);
      }
    });

    it("leaves a request alone while its owner is paying", async () => {
      const { requestId } = await awardedRequest();
      await backdate(requestId, 49);
      const { rows } = await db.query(
        "select id, total_paid_halalas from orders where request_id = $1",
        [requestId],
      );
      await admin.rpc("register_payment_attempt", {
        p_order_id: rows[0].id,
        p_gateway: "mock",
        p_provider_ref: `mock_pay_${randomUUID()}`,
        p_amount_halalas: rows[0].total_paid_halalas,
      });
      await db.query("select public.expire_unpaid_awards()");
      expect(await status(requestId)).toBe("awarded_unpaid");
    });

    it("is scheduled and not callable by users", async () => {
      const { rows } = await db.query(
        "select 1 from cron.job where jobname = 'unpaid-award-expiry'",
      );
      expect(rows).toHaveLength(1);
      await expect(dbFor(ANON).query("select public.expire_unpaid_awards()")).rejects.toMatchObject(
        { code: "42501" },
      );
    });
  });
});
