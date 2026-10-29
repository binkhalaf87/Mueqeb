/**
 * الإشعارات: كل حدث مهم يُنشئ إشعاراً للطرف الصحيح (ولا يصل لغيره)، مع صف بريد في صندوق الإرسال،
 * والإرسال يمر عبر NotificationProvider.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverPendingNotifications } from "@/lib/notifications/deliver";
import { setNotificationProvider } from "@/lib/notifications";
import { LogEmailChannel } from "@/lib/notifications/email";
import { DisabledWhatsAppChannel } from "@/lib/notifications/whatsapp";
import { createTestUser, databaseAvailable, serviceClient, signIn, type Client } from "./helpers";

const available = await databaseAvailable();
const DB_URL = process.env.DATABASE_URL ?? "";
const BUCKET = "request-documents";

const randomCr = () => String(Math.floor(1e9 + Math.random() * 9e9));

describe.skipIf(!available)("notifications (local Postgres)", () => {
  const admin = serviceClient();
  const db = new pg.Client({ connectionString: DB_URL });
  const created: string[] = [];
  let typeId: string;
  let minFee: number;

  beforeAll(async () => {
    await db.connect();
    const { data } = await admin
      .from("service_types")
      .select("id, min_fee_halalas")
      .eq("slug", "qiwa_work_permit")
      .single();
    typeId = data!.id;
    minFee = data!.min_fee_halalas;
  });

  afterAll(async () => {
    setNotificationProvider(undefined);
    await db.end();
  });

  async function kinds(client: Client) {
    const { data } = await client.from("notifications").select("kind, body, link").order("id");
    return data ?? [];
  }

  async function setup() {
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
      service_type_id: typeId,
      fee_halalas: minFee + 5000,
      duration_days: 3,
    });
    const requester = await createTestUser(admin, created);
    await requester.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الإشعارات",
      p_cr_number: randomCr(),
    });
    const { data: account } = await requester.client
      .from("requester_accounts")
      .select("id")
      .single();
    const outsider = await createTestUser(admin, created);
    return {
      city,
      provider: { ...providerUser, providerId: provider!.id },
      requester,
      accountId: account!.id,
      outsider,
    };
  }

  it("notifies the right party for each event, never anyone else", async () => {
    const { city, provider, requester, accountId, outsider } = await setup();

    // طلب عام ← عرض جديد للعميل
    const { data: requestId } = await requester.client.rpc("create_service_request", {
      p_requester_account_id: accountId,
      p_service_type_id: typeId,
      p_mode: "public",
      p_city: city,
    });
    const { error: bidError } = await provider.client.rpc("submit_bid", {
      p_request_id: requestId!,
      p_fee_halalas: minFee + 1000,
      p_expected_gov_fees_halalas: 0,
      p_duration_days: 3,
      p_includes: "الخدمة كاملة",
      p_needs_from_client: "تفويض قوى",
    });
    expect(bidError).toBeNull();
    expect((await kinds(requester.client)).map((n) => n.kind)).toEqual(["new_bid"]);

    // ترسية ← المزوّد
    const { data: bids } = await requester.client.rpc("request_bids", { p_request_id: requestId! });
    expect((await requester.client.rpc("accept_bid", { p_bid_id: bids![0].id })).error).toBeNull();
    expect((await kinds(provider.client)).map((n) => n.kind)).toEqual(["awarded"]);

    // دفع ← الطرفان
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
    expect((await kinds(requester.client)).map((n) => n.kind)).toContain("payment_received");
    expect((await kinds(provider.client)).map((n) => n.kind)).toContain("payment_received");

    // رسالة ← الطرف الآخر، بلا نص الرسالة، ومرة واحدة لكل خيط خلال 10 دقائق
    for (const body of ["أرسلت لكم المستندات", "هل وصلت؟"]) {
      await requester.client.rpc("send_message", {
        p_request_id: requestId!,
        p_provider_id: provider.providerId,
        p_body: body,
      });
    }
    const providerMessages = (await kinds(provider.client)).filter((n) => n.kind === "new_message");
    expect(providerMessages).toHaveLength(1);
    expect(providerMessages[0].body).not.toContain("المستندات");
    expect((await kinds(requester.client)).some((n) => n.kind === "new_message")).toBe(false);

    // تفويض ← تنفيذ ← تسليم
    await requester.client.rpc("confirm_delegation", { p_request_id: requestId! });
    expect(
      (await provider.client.rpc("start_execution", { p_request_id: requestId! })).error,
    ).toBeNull();
    const path = `${requestId}/delivery_proof/${randomUUID()}.pdf`;
    await provider.client.storage
      .from(BUCKET)
      .upload(path, new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    await provider.client.from("request_documents").insert({
      request_id: requestId!,
      kind: "delivery_proof",
      label: "إثبات",
      storage_path: path,
      file_name: "p.pdf",
      mime_type: "application/pdf",
      size_bytes: 8,
      uploaded_by: provider.id,
    });
    expect(
      (await provider.client.rpc("submit_delivery", { p_request_id: requestId!, p_note: "أُنجز" }))
        .error,
    ).toBeNull();
    const delivered = (await kinds(requester.client)).filter((n) => n.kind === "delivered");
    expect(delivered).toHaveLength(1);
    expect(delivered[0].link).toBe(`/dashboard/requester/requests/${requestId}`);

    // تذكير المهلة: مرة واحدة فقط مهما تكرر المُجدول
    await db.query(
      "update service_requests set delivered_at = now() - interval '2 days 1 hour' where id = $1",
      [requestId],
    );
    await db.query("select public.remind_confirmation_deadlines()");
    await db.query("select public.remind_confirmation_deadlines()");
    expect(
      (await kinds(requester.client)).filter((n) => n.kind === "confirmation_deadline"),
    ).toHaveLength(1);

    // نزاع ← المزوّد والإدارة
    expect(
      (
        await requester.client.rpc("open_dispute", {
          p_request_id: requestId!,
          p_reason: "لم يكتمل",
        })
      ).error,
    ).toBeNull();
    expect((await kinds(provider.client)).map((n) => n.kind)).toContain("dispute_opened");
    const adminUser = await signIn({ email: "admin@mueqeb.test" });
    expect(
      (await kinds(adminUser)).some(
        (n) => n.kind === "dispute_opened" && n.link === `/admin/disputes/${requestId}`,
      ),
    ).toBe(true);

    // الغريب لا يرى شيئاً
    expect(await kinds(outsider.client)).toHaveLength(0);
  });

  it("users read and mark only their own notifications; nobody inserts directly", async () => {
    const { requester, outsider } = await setup();
    await db.query("select public.notify($1, 'test', 'عنوان', 'نص', '/dashboard')", [requester.id]);
    const { data: mine } = await requester.client.from("notifications").select("id").single();

    // الغريب لا يقرأ ولا يعلّم إشعار غيره
    const { data: stolen } = await outsider.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", mine!.id)
      .select("id");
    expect(stolen ?? []).toHaveLength(0);

    // صاحب الإشعار يعلّمه مقروءاً فقط (لا يغيّر النص)
    const { error: titleError } = await requester.client
      .from("notifications")
      .update({ title: "معدّل" })
      .eq("id", mine!.id);
    expect(titleError?.code).toBe("42501");
    const { data: read } = await requester.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", mine!.id)
      .select("id");
    expect(read).toHaveLength(1);

    // لا إدراج مباشر ولا وصول لصندوق الإرسال ولا استدعاء notify
    const { error: insertError } = await requester.client
      .from("notifications")
      .insert({ user_id: outsider.id, kind: "fake", title: "x" });
    expect(insertError).not.toBeNull();
    expect((await requester.client.from("notification_outbox").select("id")).error).not.toBeNull();
    expect(
      (
        await requester.client.rpc(
          "notify" as never,
          {
            p_user_id: outsider.id,
            p_kind: "x",
            p_title: "x",
            p_body: "x",
            p_link: "/",
          } as never,
        )
      ).error,
    ).not.toBeNull();
  });

  it("delivers pending emails through the provider and records the outcome", async () => {
    const email = new LogEmailChannel();
    setNotificationProvider({
      channel: (name) => (name === "email" ? email : new DisabledWhatsAppChannel()),
    });
    const { requester } = await setup();
    await db.query(
      "select public.notify($1, 'test_email', 'عنوان الاختبار', 'نص الاختبار', '/dashboard')",
      [requester.id],
    );

    // قد توجد إشعارات معلّقة من اختبارات أخرى: نكرر حتى يُرسل إشعارنا
    for (let i = 0; i < 20; i++) {
      await deliverPendingNotifications(200);
      const { rows } = await db.query(
        `select o.status from notification_outbox o join notifications n on n.id = o.notification_id
         where n.user_id = $1 and n.kind = 'test_email'`,
        [requester.id],
      );
      if (rows[0]?.status !== "pending") break;
    }
    const { rows } = await db.query(
      `select o.status, o.attempts, o.sent_at from notification_outbox o
       join notifications n on n.id = o.notification_id
       where n.user_id = $1 and n.kind = 'test_email'`,
      [requester.id],
    );
    expect(rows[0].status).toBe("sent");
    expect(rows[0].sent_at).not.toBeNull();
    const sent = email.sent.find((n) => n.kind === "test_email")!;
    expect(sent.recipient.email).toMatch(/@mueqeb\.test$/);
    expect(sent.title).toBe("عنوان الاختبار");
  });
});
