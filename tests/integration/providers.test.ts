/**
 * سياسات المزوّدين والمستندات والكتالوج على Postgres المحلي.
 * تتطلب: npm run db:reset && npm run seed. تُتخطى إن لم تكن قاعدة البيانات متاحة.
 */
import { randomUUID } from "node:crypto";
import { signSession, verifyFileToken } from "@/lib/auth/token";
import { GET as downloadFile } from "@/app/api/files/[token]/route";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  createTestUser,
  serviceClient,
  signIn,
  databaseAvailable,
  type Client,
} from "./helpers";

const available = await databaseAvailable();
const BUCKET = "provider-documents";
const DOC_TYPES = [
  "commercial_register",
  "municipal_license",
  "manager_id",
  "iban_certificate",
] as const;

function randomCr() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

describe.skipIf(!available)("providers, documents & catalog (local Postgres)", () => {
  const admin = serviceClient();
  const created: string[] = [];

  let approvedId: string;
  let pendingId: string;
  let approvedClient: Client;
  let pendingClient: Client;
  let requesterClient: Client;
  let adminClient: Client;
  let approvedDocPath: string;

  /** مزوّد جديد كمسودة؛ مع المستندات الأربعة إن طُلب */
  async function freshProvider(withDocs: boolean) {
    const user = await createTestUser(admin, created);
    const { error: roleError } = await user.client.rpc("complete_onboarding", {
      p_role: "provider",
    });
    if (roleError) throw roleError;
    const { data: provider, error } = await user.client
      .from("providers")
      .insert({
        profile_id: user.id,
        office_name: "مكتب اختبار",
        cr_number: randomCr(),
        municipal_license_number: "LIC-1234",
        cities: ["الرياض"],
      })
      .select("id")
      .single();
    if (error) throw error;

    if (withDocs) {
      for (const docType of DOC_TYPES) {
        const path = `${provider.id}/${docType}-${randomUUID()}.pdf`;
        const { error: uploadError } = await user.client.storage
          .from(BUCKET)
          .upload(path, new Blob(["%PDF-1.4"], { type: "application/pdf" }), {
            contentType: "application/pdf",
          });
        if (uploadError) throw uploadError;
        const { error: docError } = await user.client.from("provider_documents").insert({
          provider_id: provider.id,
          doc_type: docType,
          storage_path: path,
          file_name: `${docType}.pdf`,
          mime_type: "application/pdf",
          size_bytes: 8,
        });
        if (docError) throw docError;
      }
    }
    return { ...user, providerId: provider.id };
  }

  beforeAll(async () => {
    approvedClient = await signIn({ email: "provider1@mueqeb.test" });
    pendingClient = await signIn({ phone: "+966500000002" });
    requesterClient = await signIn({ email: "establishment@mueqeb.test" });
    adminClient = await signIn({ email: "admin@mueqeb.test" });

    const { data } = await admin
      .from("providers")
      .select("id, verification_status")
      .in("cr_number", ["1010765432", "4030112233"]);
    approvedId = data!.find((p) => p.verification_status === "approved")!.id;
    pendingId = data!.find((p) => p.verification_status === "pending")!.id;

    const { data: doc } = await admin
      .from("provider_documents")
      .select("storage_path")
      .eq("provider_id", approvedId)
      .limit(1)
      .single();
    approvedDocPath = doc!.storage_path;
  });

  afterAll(async () => {
    for (const id of created) {
      const { data: p } = await admin
        .from("providers")
        .select("id")
        .eq("profile_id", id)
        .maybeSingle();
      if (p) {
        const { data: files } = await admin.storage.from(BUCKET).list(p.id);
        if (files?.length) {
          await admin.storage.from(BUCKET).remove(files.map((f) => `${p.id}/${f.name}`));
        }
        await admin.from("providers").delete().eq("id", p.id);
      }
      await admin.auth.admin.deleteUser(id);
    }
  });

  describe("catalog", () => {
    it("is readable anonymously with at least 10 service types", async () => {
      const anon = anonClient();
      const { data: categories } = await anon.from("service_categories").select("slug");
      const { data: types } = await anon
        .from("service_types")
        .select("min_fee_halalas, guide_min_halalas, guide_max_halalas");
      expect(categories?.map((c) => c.slug)).toEqual(
        expect.arrayContaining(["qiwa", "gosi", "mudad", "commercial_register", "balady"]),
      );
      expect(types!.length).toBeGreaterThanOrEqual(10);
      for (const t of types!) {
        expect(Number.isInteger(t.min_fee_halalas)).toBe(true);
        expect(t.guide_min_halalas).toBeGreaterThanOrEqual(t.min_fee_halalas);
        expect(t.guide_max_halalas).toBeGreaterThanOrEqual(t.guide_min_halalas);
      }
    });

    it("cannot be modified by users", async () => {
      const { error } = await adminClient
        .from("service_types")
        .update({ min_fee_halalas: 1 })
        .neq("id", "");
      expect(error).not.toBeNull();
    });
  });

  describe("public visibility", () => {
    it("anon cannot read the providers table directly", async () => {
      const { data } = await anonClient().from("providers").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("browse lists approved providers only", async () => {
      const { data } = await anonClient().rpc("public_providers", {});
      const ids = data!.map((p) => p.id);
      expect(ids).toContain(approvedId);
      expect(ids).not.toContain(pendingId);
      expect(Object.keys(data![0]).sort()).toEqual(
        ["bio", "cities", "from_fee_halalas", "id", "office_name", "services_count"].sort(),
      );
    });

    it("filters by city and service", async () => {
      const anon = anonClient();
      const { data: jeddah } = await anon.rpc("public_providers", { p_city: "جدة" });
      expect(jeddah!.map((p) => p.id)).not.toContain(approvedId);
      const { data: riyadh } = await anon.rpc("public_providers", { p_city: "الرياض" });
      expect(riyadh!.map((p) => p.id)).toContain(approvedId);

      const { data: type } = await anon
        .from("service_types")
        .select("id")
        .eq("slug", "qiwa_work_permit")
        .single();
      const { data: byService } = await anon.rpc("public_providers", {
        p_service_type_id: type!.id,
      });
      expect(byService!.find((p) => p.id === approvedId)?.from_fee_halalas).toBe(18000);

      const { data: other } = await anon
        .from("service_types")
        .select("id")
        .eq("slug", "balady_health_certificate")
        .single();
      const { data: none } = await anon.rpc("public_providers", { p_service_type_id: other!.id });
      expect(none!.map((p) => p.id)).not.toContain(approvedId);
    });

    it("public profile and services are hidden for unapproved providers", async () => {
      const anon = anonClient();
      const { data: approved } = await anon.rpc("public_provider", { p_provider_id: approvedId });
      expect(approved).toHaveLength(1);
      expect(approved![0]).not.toHaveProperty("cr_number");

      const { data: pending } = await anon.rpc("public_provider", { p_provider_id: pendingId });
      expect(pending).toHaveLength(0);
      const { data: pendingServices } = await anon.rpc("public_provider_services", {
        p_provider_id: pendingId,
      });
      expect(pendingServices).toHaveLength(0);
    });
  });

  describe("documents", () => {
    it("owner and admin can read rows and sign URLs", async () => {
      const { data: own } = await approvedClient
        .from("provider_documents")
        .select("id")
        .eq("provider_id", approvedId);
      expect(own).toHaveLength(4);
      const { data: ownUrl } = await approvedClient.storage
        .from(BUCKET)
        .createSignedUrl(approvedDocPath, 60);
      expect(ownUrl?.signedUrl).toBeTruthy();

      const { data: adminRows } = await adminClient
        .from("provider_documents")
        .select("id")
        .eq("provider_id", approvedId);
      expect(adminRows).toHaveLength(4);
      const { data: adminUrl } = await adminClient.storage
        .from(BUCKET)
        .createSignedUrl(approvedDocPath, 60);
      expect(adminUrl?.signedUrl).toBeTruthy();
      // مسار التنزيل نفسه: الرمز الصحيح يعيد الملف، والمعدَّل يُرفض
      const token = adminUrl!.signedUrl.split("/").pop()!;
      const download = (t: string) =>
        downloadFile(new Request(`http://test/api/files/${t}`), {
          params: Promise.resolve({ token: t }),
        });
      const res = await download(token);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect((await download(`${token}x`)).status).toBe(403);
    });

    it.each([
      ["another provider", () => pendingClient],
      ["a requester", () => requesterClient],
      ["anonymous", () => anonClient()],
    ])("%s cannot read rows, sign URLs or download", async (_label, getClient) => {
      const client = getClient();
      const { data: rows } = await client
        .from("provider_documents")
        .select("id")
        .eq("provider_id", approvedId);
      expect(rows ?? []).toHaveLength(0);

      const { data: signed } = await client.storage
        .from(BUCKET)
        .createSignedUrl(approvedDocPath, 60);
      expect(signed?.signedUrl).toBeFalsy();
      const { data: file } = await client.storage.from(BUCKET).download(approvedDocPath);
      expect(file).toBeNull();
    });

    it("files have no public URL: only a valid, untampered signed token reaches them", async () => {
      const { data: none } = await anonClient()
        .storage.from(BUCKET)
        .createSignedUrl(approvedDocPath, 60);
      expect(none).toBeNull();

      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(approvedDocPath, 60);
      const token = signed!.signedUrl.split("/").pop()!;
      expect(await verifyFileToken(token)).toEqual({ bucket: BUCKET, path: approvedDocPath });

      // تغيير المسار داخل الرمز يُبطل التوقيع، ورمز الجلسة لا يصلح رابط ملف
      const [body, sig] = token.split(".");
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      const forged = Buffer.from(JSON.stringify({ ...payload, path: "x/other.pdf" })).toString(
        "base64url",
      );
      expect(await verifyFileToken(`${forged}.${sig}`)).toBeNull();
      expect(await verifyFileToken(await signSession(randomUUID()))).toBeNull();
    });

    it("a provider cannot upload into another provider's folder", async () => {
      const { client } = await freshProvider(false);
      const { error } = await client.storage
        .from(BUCKET)
        .upload(`${approvedId}/x-${randomUUID()}.pdf`, new Blob(["x"]), {
          contentType: "application/pdf",
        });
      expect(error).not.toBeNull();
    });

    it("documents are locked once approved", async () => {
      const { error } = await approvedClient.storage
        .from(BUCKET)
        .upload(`${approvedId}/manager_id-${randomUUID()}.pdf`, new Blob(["x"]), {
          contentType: "application/pdf",
        });
      expect(error).not.toBeNull();
      await approvedClient.from("provider_documents").delete().eq("provider_id", approvedId);
      const { count } = await admin
        .from("provider_documents")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", approvedId);
      expect(count).toBe(4);
    });
  });

  describe("provider data rules", () => {
    it("a provider cannot change their own verification status", async () => {
      const { error } = await pendingClient
        .from("providers")
        .update({ verification_status: "approved" })
        .eq("id", pendingId);
      expect(error).not.toBeNull();
    });

    it("identity is locked after submission; bio and cities stay editable", async () => {
      const { error } = await pendingClient
        .from("providers")
        .update({ office_name: "اسم آخر" })
        .eq("id", pendingId);
      expect(error?.message).toContain("provider_identity_locked");

      const { error: bioError } = await pendingClient
        .from("providers")
        .update({ bio: "خدمات تعقيب سريعة لمنشآت جدة ومكة." })
        .eq("id", pendingId);
      expect(bioError).toBeNull();
    });

    it("requesters cannot create a provider profile", async () => {
      const { data: me } = await requesterClient.auth.getUser();
      const { error } = await requesterClient.from("providers").insert({
        profile_id: me.user!.id,
        office_name: "مكتب",
        cr_number: randomCr(),
        municipal_license_number: "1234",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a fee below the service minimum", async () => {
      const { providerId, client } = await freshProvider(false);
      const { data: type } = await client
        .from("service_types")
        .select("id, min_fee_halalas")
        .eq("slug", "cr_issue")
        .single();
      const { error } = await client.from("provider_services").insert({
        provider_id: providerId,
        service_type_id: type!.id,
        fee_halalas: type!.min_fee_halalas - 1,
        duration_days: 3,
      });
      expect(error?.message).toContain("fee_below_minimum");

      const { error: okError } = await client.from("provider_services").insert({
        provider_id: providerId,
        service_type_id: type!.id,
        fee_halalas: type!.min_fee_halalas,
        duration_days: 3,
      });
      expect(okError).toBeNull();
    });

    it("cannot add services to another provider", async () => {
      const { client } = await freshProvider(false);
      const { data: type } = await client.from("service_types").select("id").limit(1).single();
      const { error } = await client.from("provider_services").insert({
        provider_id: approvedId,
        service_type_id: type!.id,
        fee_halalas: 1_000_000,
        duration_days: 3,
      });
      expect(error).not.toBeNull();
    });

    it("submission requires all four documents", async () => {
      const { client } = await freshProvider(false);
      const { error } = await client.rpc("submit_provider_for_review");
      expect(error?.message).toContain("documents_incomplete");
    });

    it("only admins can review", async () => {
      const { error } = await pendingClient.rpc("review_provider", {
        p_provider_id: pendingId,
        p_action: "approve",
      });
      expect(error?.message).toContain("forbidden");
    });
  });

  it("full review cycle: submit → reject → resubmit → approve → suspend", async () => {
    const { client, providerId } = await freshProvider(true);
    const { data: type } = await client
      .from("service_types")
      .select("id, min_fee_halalas")
      .eq("slug", "mudad_monthly_payroll")
      .single();
    await client.from("provider_services").insert({
      provider_id: providerId,
      service_type_id: type!.id,
      fee_halalas: type!.min_fee_halalas,
      duration_days: 2,
    });

    expect((await client.rpc("submit_provider_for_review")).error).toBeNull();
    expect((await client.rpc("submit_provider_for_review")).error?.message).toContain(
      "invalid_status",
    );

    const noReason = await adminClient.rpc("review_provider", {
      p_provider_id: providerId,
      p_action: "reject",
    });
    expect(noReason.error?.message).toContain("reason_required");

    const reject = await adminClient.rpc("review_provider", {
      p_provider_id: providerId,
      p_action: "reject",
      p_reason: "صورة السجل غير واضحة",
    });
    expect(reject.error).toBeNull();
    const { data: rejected } = await client
      .from("providers")
      .select("verification_status, rejection_reason")
      .eq("id", providerId)
      .single();
    expect(rejected).toEqual({
      verification_status: "rejected",
      rejection_reason: "صورة السجل غير واضحة",
    });

    // بعد الرفض يمكن تعديل الهوية ثم إعادة الإرسال
    expect(
      (
        await client
          .from("providers")
          .update({ office_name: "مكتب اختبار المعدّل" })
          .eq("id", providerId)
      ).error,
    ).toBeNull();
    expect((await client.rpc("submit_provider_for_review")).error).toBeNull();

    const approve = await adminClient.rpc("review_provider", {
      p_provider_id: providerId,
      p_action: "approve",
    });
    expect(approve.error).toBeNull();
    const { data: visible } = await anonClient().rpc("public_provider", {
      p_provider_id: providerId,
    });
    expect(visible?.[0]?.office_name).toBe("مكتب اختبار المعدّل");

    const suspend = await adminClient.rpc("review_provider", {
      p_provider_id: providerId,
      p_action: "suspend",
      p_reason: "شكاوى متكررة",
    });
    expect(suspend.error).toBeNull();
    const { data: hidden } = await anonClient().rpc("public_provider", {
      p_provider_id: providerId,
    });
    expect(hidden).toHaveLength(0);
  });
});
