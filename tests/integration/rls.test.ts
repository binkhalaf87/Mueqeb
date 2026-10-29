/**
 * اختبارات سياسات RLS والدوال على Postgres المحلي.
 * تتطلب: npm run db:reset && npm run seed، وملف .env.local.
 * تُتخطى تلقائياً إن لم تكن قاعدة البيانات متاحة.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  databaseAvailable,
  PASSWORD,
  serviceClient,
  signIn,
  type Client,
} from "./helpers";

const available = await databaseAvailable();

const signedIn = (email: string) => signIn({ email });

describe.skipIf(!available)("RLS & onboarding (local Postgres)", () => {
  const admin = serviceClient();
  const createdUserIds: string[] = [];

  async function freshUser(): Promise<{ id: string; client: Client }> {
    const email = `test-${randomUUID()}@mueqeb.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      user_metadata: { full_name: "مستخدم اختبار" },
    });
    if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
    createdUserIds.push(data.user.id);
    return { id: data.user.id, client: await signedIn(email) };
  }

  let requester: Client;
  let provider: Client;
  let platformAdmin: Client;

  beforeAll(async () => {
    requester = await signedIn("establishment@mueqeb.test");
    provider = await signedIn("provider1@mueqeb.test");
    platformAdmin = await signedIn("admin@mueqeb.test");
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.from("establishment_members").delete().eq("user_id", id);
      await admin.from("requester_accounts").delete().eq("created_by", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("anonymous users read nothing", async () => {
    const anon = anonClient();
    const { data: profiles } = await anon.from("profiles").select("id");
    const { data: settings } = await anon.from("settings").select("key");
    expect(profiles ?? []).toHaveLength(0);
    expect(settings ?? []).toHaveLength(0);
  });

  it("a user reads only their own profile", async () => {
    const { data } = await provider.from("profiles").select("id, role");
    expect(data).toHaveLength(1);
    expect(data?.[0].role).toBe("provider");
  });

  it("a user sees only their own requester account", async () => {
    const { data: own } = await requester.from("requester_accounts").select("cr_number");
    expect(own?.map((a) => a.cr_number)).toEqual(["2050123456"]);

    const { data: fromProvider } = await provider.from("requester_accounts").select("id");
    expect(fromProvider).toHaveLength(0);
    const { data: membersFromProvider } = await provider.from("establishment_members").select("*");
    expect(membersFromProvider).toHaveLength(0);
  });

  it("admin reads all profiles and accounts", async () => {
    const { data: profiles } = await platformAdmin.from("profiles").select("role");
    const roles = new Set(profiles?.map((p) => p.role));
    expect([...roles]).toEqual(expect.arrayContaining(["admin", "provider", "requester"]));

    const { data: accounts } = await platformAdmin.from("requester_accounts").select("id");
    expect(accounts?.length).toBeGreaterThanOrEqual(2);
  });

  it("a user updates their own profile but cannot change role", async () => {
    const { id, client } = await freshUser();
    const { error: okError } = await client.from("profiles").update({ city: "أبها" }).eq("id", id);
    expect(okError).toBeNull();

    const { error: roleError } = await client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", id);
    expect(roleError).not.toBeNull();

    const { data } = await admin.from("profiles").select("role, city").eq("id", id).single();
    expect(data).toEqual({ role: null, city: "أبها" });
  });

  it("a user cannot update someone else's profile", async () => {
    const { client } = await freshUser();
    const { data: target } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("role", "provider")
      .limit(1)
      .single();
    await client.from("profiles").update({ full_name: "مخترق" }).eq("id", target!.id);
    const { data: after } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", target!.id)
      .single();
    expect(after?.full_name).toBe(target!.full_name);
  });

  it("onboarding never grants admin and runs only once", async () => {
    const { id, client } = await freshUser();

    const { error: adminError } = await client.rpc("complete_onboarding", { p_role: "admin" });
    expect(adminError?.message).toContain("invalid_role");

    const { error } = await client.rpc("complete_onboarding", { p_role: "provider" });
    expect(error).toBeNull();

    const { error: againError } = await client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "individual",
    });
    expect(againError?.message).toContain("already_onboarded");

    const { data } = await admin.from("profiles").select("role").eq("id", id).single();
    expect(data?.role).toBe("provider");
  });

  it("establishment onboarding creates the account with the user as owner", async () => {
    const { id, client } = await freshUser();
    const crNumber = String(Date.now()).slice(-10);
    const { error } = await client.rpc("complete_onboarding", {
      p_role: "requester",
      p_account_type: "establishment",
      p_establishment_name: "مؤسسة الاختبار",
      p_cr_number: crNumber,
    });
    expect(error).toBeNull();

    // العضوية والحساب كلاهما مقروءان للمستخدم نفسه (RLS)
    const { data: membership } = await client
      .from("establishment_members")
      .select("member_role, account_id")
      .eq("user_id", id)
      .single();
    expect(membership?.member_role).toBe("owner");
    const { data: account } = await client
      .from("requester_accounts")
      .select("account_type, cr_number")
      .eq("id", membership!.account_id)
      .single();
    expect(account).toEqual({ account_type: "establishment", cr_number: crNumber });
  });

  it("users cannot insert accounts or memberships directly", async () => {
    const { id, client } = await freshUser();
    const { error } = await client
      .from("requester_accounts")
      .insert({ account_type: "individual", created_by: id });
    expect(error).not.toBeNull();
  });

  it("settings: readable by users, writable by admin only", async () => {
    const { data } = await requester
      .from("settings")
      .select("value")
      .eq("key", "provider_commission_pct")
      .single();
    expect(data?.value).toBe(15);

    await requester.from("settings").update({ value: 0 }).eq("key", "provider_commission_pct");
    const { data: unchanged } = await admin
      .from("settings")
      .select("value")
      .eq("key", "provider_commission_pct")
      .single();
    expect(unchanged?.value).toBe(15);

    const { data: updated, error } = await platformAdmin
      .from("settings")
      .update({ value: 15 })
      .eq("key", "provider_commission_pct")
      .select("value");
    expect(error).toBeNull();
    expect(updated).toHaveLength(1);
  });
});
