/**
 * الحساب: تغيير كلمة المرور والبريد، ونبذة المنشأة (المالك فقط)، وبيانات الدخول الخاصة.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changeEmail,
  changePassword,
  sessionVersion,
  verifyCredentials,
  verifyPasswordById,
} from "@/lib/auth/accounts";
import { createTestUser, databaseAvailable, PASSWORD, serviceClient, type Client } from "./helpers";

const available = await databaseAvailable();

describe.skipIf(!available)("account settings (local Postgres)", () => {
  const admin = serviceClient();
  const created: string[] = [];
  let owner: { id: string; client: Client };
  let outsider: { id: string; client: Client };
  let accountId: string;

  beforeAll(async () => {
    owner = await createTestUser(admin, created);
    outsider = await createTestUser(admin, created);
    const { error } = await owner.client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الاختبار",
      p_cr_number: String(Math.floor(1e9 + Math.random() * 9e9)),
    });
    expect(error).toBeNull();
    const { data } = await owner.client.from("requester_accounts").select("id").single();
    accountId = data!.id;
  });

  afterAll(async () => {
    for (const id of created) {
      await admin.from("establishment_members").delete().eq("user_id", id);
      await admin.from("requester_accounts").delete().eq("created_by", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("only the owner updates the establishment name and about", async () => {
    const { data, error } = await owner.client
      .from("requester_accounts")
      .update({ establishment_name: "مؤسسة محدّثة", about: "نبذة" })
      .eq("id", accountId)
      .select("establishment_name, about");
    expect(error).toBeNull();
    expect(data).toEqual([{ establishment_name: "مؤسسة محدّثة", about: "نبذة" }]);

    const { data: none } = await outsider.client
      .from("requester_accounts")
      .update({ about: "اختراق" })
      .eq("id", accountId)
      .select("id");
    expect(none ?? []).toHaveLength(0);

    // رقم السجل التجاري لا يُعدّل من الواجهة
    const { error: crError } = await owner.client
      .from("requester_accounts")
      .update({ cr_number: "1234567890" })
      .eq("id", accountId);
    expect(crError?.code).toBe("42501");
  });

  it("about may not ask for government credentials", async () => {
    const { error } = await owner.client
      .from("requester_accounts")
      .update({ about: "أرسلوا كلمة المرور الخاصة بقوى" })
      .eq("id", accountId);
    expect(error?.code).toBe("23514");
  });

  it("my_login returns only the caller's own login data", async () => {
    const { data } = await owner.client.rpc("my_login");
    expect(data).toHaveLength(1);
    expect(data![0].email).toMatch(/@mueqeb\.test$/);
    const { data: other } = await outsider.client.rpc("my_login");
    expect(other![0].email).not.toBe(data![0].email);
  });

  it("changes the password and bumps the session version", async () => {
    expect(await verifyPasswordById(owner.id, PASSWORD)).toBe(true);
    expect(await verifyPasswordById(owner.id, "wrong")).toBe(false);
    const before = await sessionVersion(owner.id);
    const after = await changePassword(owner.id, "NewPass#2026");
    expect(after).toBe(before! + 1);
    expect(await sessionVersion(owner.id)).toBe(after);
    expect(await verifyPasswordById(owner.id, PASSWORD)).toBe(false);
    expect(await verifyPasswordById(owner.id, "NewPass#2026")).toBe(true);

    const { data } = await admin.rpc("my_login"); // service: لا مستخدم حالي
    expect(data).toHaveLength(0);
  });

  it("changes the login email, refusing one used by another account", async () => {
    const email = `test-${randomUUID()}@mueqeb.test`;
    expect(await changeEmail(outsider.id, email)).toEqual({ ok: true });
    expect(await verifyCredentials({ kind: "email", email }, PASSWORD)).toBe(outsider.id);
    expect(await changeEmail(owner.id, email.toUpperCase())).toEqual({
      ok: false,
      reason: "exists",
    });
  });
});
