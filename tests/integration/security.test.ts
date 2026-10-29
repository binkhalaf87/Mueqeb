/**
 * المراجعة الأمنية (المرحلة 8): فحوص شاملة على كل جدول ودالة، لا على حالات منتقاة فقط.
 * أي جدول أو صلاحية أو دالة جديدة تُفشل هذه الاختبارات حتى تُراجَع وتُضاف للقوائم صراحةً.
 */
import pg from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ANON, asUser, dbFor, SERVICE, type Actor } from "@/lib/db/core";
import { verifyCredentials } from "@/lib/auth/accounts";
import { createTestUser, databaseAvailable, PASSWORD, serviceClient } from "./helpers";

const available = await databaseAvailable();
const DB_URL = process.env.DATABASE_URL ?? "";

/** صلاحيات الكتابة المسموحة (جدول.دور.نوع[أعمدة]) — مراجَعة يدوياً */
const ALLOWED_WRITES = [
  "public.delegation_guides|authenticated|UPDATE|steps,title,updated_at,updated_by",
  "public.notifications|authenticated|UPDATE|read_at",
  "public.profiles|authenticated|UPDATE|city,full_name,phone",
  "public.provider_documents|authenticated|DELETE|*",
  "public.provider_documents|authenticated|INSERT|doc_type,file_name,mime_type,provider_id,size_bytes,storage_path",
  "public.provider_documents|authenticated|UPDATE|file_name,mime_type,size_bytes,storage_path,uploaded_at",
  "public.provider_services|authenticated|DELETE|*",
  "public.provider_services|authenticated|INSERT|active,duration_days,fee_halalas,notes,provider_id,service_type_id",
  "public.provider_services|authenticated|UPDATE|active,duration_days,fee_halalas,notes",
  "public.providers|authenticated|INSERT|bio,cities,cr_number,municipal_license_number,office_name,profile_id",
  "public.providers|authenticated|UPDATE|bio,cities,cr_number,municipal_license_number,office_name",
  "public.request_documents|authenticated|INSERT|file_name,kind,label,mime_type,request_id,size_bytes,storage_path,uploaded_by",
  "public.requester_accounts|authenticated|UPDATE|about,establishment_name",
  "public.service_types|authenticated|INSERT|active,category_id,delegation_platform,description,guide_max_halalas,guide_min_halalas,min_fee_halalas,name_ar,required_docs,slug,sort_order",
  "public.service_types|authenticated|UPDATE|active,delegation_platform,description,guide_max_halalas,guide_min_halalas,min_fee_halalas,name_ar,required_docs,sort_order",
  "public.settings|authenticated|UPDATE|description,updated_at,value",
  "storage.objects|authenticated|DELETE|*",
  "storage.objects|authenticated|INSERT|*",
];

/** دوال بصلاحيات مرتفعة (SECURITY DEFINER) يستطيع الزائر تنفيذها: قراءات عامة ومساعدات auth.uid() */
const ANON_DEFINER_FUNCTIONS = [
  "can_access_thread",
  "current_provider_id",
  "current_provider_is_approved",
  "is_account_member",
  "is_account_owner",
  "is_admin",
  "is_awarded_provider",
  "is_request_member",
  "provider_can_view_request",
  "provider_reviews",
  "provider_stats",
  "public_provider",
  "public_provider_services",
  "public_providers",
  "public_service_overview",
  "reviews_revealed",
];

/** جداول يقرؤها الزائر (الكتالوج فقط) */
const ANON_READABLE = new Set([
  "public.service_categories",
  "public.service_types",
  "storage.buckets",
]);

/** جداول قد يرى فيها مستخدم جديد بلا دور صفوفاً: ملفه، والإعدادات العامة، والكتالوج، والإرشادات */
const OUTSIDER_READABLE = new Set([
  "public.profiles",
  "public.settings",
  "public.service_categories",
  "public.service_types",
  "public.delegation_guides",
  "storage.buckets",
]);

/** جداول مشتركة بطبيعتها بين حسابين لا علاقة بينهما */
const SHARED_BY_DESIGN = new Set([
  "public.settings",
  "public.service_categories",
  "public.service_types",
  "public.delegation_guides",
  "storage.buckets",
]);

async function userTables() {
  const rows = await dbFor(SERVICE).query<{ name: string }>(
    `select n.nspname || '.' || c.relname as name
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname in ('public', 'storage')
     order by 1`,
  );
  return rows.map((r) => r.name);
}

/** صفوف الجدول المرئية للمنفّذ (كنص JSON لكل صف)، أو null إن رُفضت القراءة */
async function visibleRows(actor: Actor, table: string): Promise<string[] | null> {
  try {
    const rows = await dbFor(actor).query<{ r: string }>(
      `select to_jsonb(t)::text as r from ${table} t`,
    );
    return rows.map((x) => x.r);
  } catch (error) {
    if ((error as { code?: string }).code === "42501") return null;
    throw error;
  }
}

async function login(email: string) {
  const id = await verifyCredentials({ kind: "email", email }, PASSWORD);
  if (!id) throw new Error(`login failed: ${email}`);
  return asUser(id);
}

async function loginPhone(phone: string) {
  const id = await verifyCredentials({ kind: "phone", phone }, PASSWORD);
  if (!id) throw new Error(`login failed: ${phone}`);
  return asUser(id);
}

describe.skipIf(!available)("security review (local Postgres)", () => {
  const db = new pg.Client({ connectionString: DB_URL });
  const admin = serviceClient();
  const created: string[] = [];

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
    await db.end();
  });

  it("every table in every schema has Row Level Security enabled", async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || c.relname as name
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p')
         and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
         and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("write privileges for anon/authenticated match the reviewed list exactly", async () => {
    const { rows } = await db.query<{ entry: string }>(
      `with table_level as (
         select table_schema || '.' || table_name as t, grantee, privilege_type, '*' as cols
         from information_schema.role_table_grants
         where grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
           and table_schema not in ('pg_catalog', 'information_schema')
       ), column_level as (
         select table_schema || '.' || table_name as t, grantee, privilege_type,
                string_agg(column_name, ',' order by column_name) as cols
         from information_schema.column_privileges
         where grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')
           and table_schema not in ('pg_catalog', 'information_schema')
           and (table_schema || '.' || table_name, grantee, privilege_type)
               not in (select t, grantee, privilege_type from table_level)
         group by 1, 2, 3
       )
       select t || '|' || grantee || '|' || privilege_type || '|' || cols as entry
       from (select * from table_level union all select * from column_level) x
       order by 1`,
    );
    expect(rows.map((r) => r.entry)).toEqual([...ALLOWED_WRITES].sort());
  });

  it("anon has no write privilege on any table", async () => {
    const { rows } = await db.query(
      `select table_schema, table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and privilege_type <> 'SELECT'
         and table_schema not in ('pg_catalog', 'information_schema')`,
    );
    expect(rows).toEqual([]);
  });

  it("anon executes only reviewed SECURITY DEFINER functions", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prosecdef
         and has_function_privilege('anon', p.oid, 'execute')
       order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(ANON_DEFINER_FUNCTIONS);
  });

  it("anon reads nothing beyond the active catalog, in every table", async () => {
    const leaks: string[] = [];
    for (const table of await userTables()) {
      const rows = await visibleRows(ANON, table);
      if (rows?.length && !ANON_READABLE.has(table)) leaks.push(`${table}: ${rows.length}`);
    }
    expect(leaks).toEqual([]);
    // والكتالوج للزائر: الأنواع الفعّالة فقط
    const inactive = await dbFor(ANON).query("select 1 from public.service_types where not active");
    expect(inactive).toHaveLength(0);
  });

  it("a fresh signed-in user without a role sees only their profile and public reference data", async () => {
    const outsider = await createTestUser(admin, created);
    const actor = asUser(outsider.id);
    const leaks: string[] = [];
    for (const table of await userTables()) {
      const rows = await visibleRows(actor, table);
      if (rows?.length && !OUTSIDER_READABLE.has(table)) leaks.push(`${table}: ${rows.length}`);
    }
    expect(leaks).toEqual([]);
    const profiles = await dbFor(actor).query<{ id: string }>("select id from public.profiles");
    expect(profiles.map((p) => p.id)).toEqual([outsider.id]);
  });

  it("two unrelated requesters see disjoint data in every table", async () => {
    const establishment = await login("establishment@mueqeb.test");
    const individual = await loginPhone("+966500000003");
    const overlaps: string[] = [];
    for (const table of await userTables()) {
      if (SHARED_BY_DESIGN.has(table)) continue;
      const [a, b] = await Promise.all([
        visibleRows(establishment, table),
        visibleRows(individual, table),
      ]);
      const seen = new Set(a ?? []);
      const shared = (b ?? []).filter((r) => seen.has(r));
      if (shared.length) overlaps.push(`${table}: ${shared.length}`);
    }
    expect(overlaps).toEqual([]);
  });

  it("two providers never see each other's bids, orders, documents, payouts or notifications", async () => {
    const p3 = await login("provider3@mueqeb.test");
    const p4 = await login("provider4@mueqeb.test");
    const privateTables = [
      "public.bids",
      "public.orders",
      "public.payments",
      "public.provider_documents",
      "public.provider_payouts",
      "public.notifications",
      "public.messages",
      "public.request_private_details",
      "public.request_documents",
      "public.ledger_entries",
      "storage.objects",
    ];
    const overlaps: string[] = [];
    for (const table of privateTables) {
      const [a, b] = await Promise.all([visibleRows(p3, table), visibleRows(p4, table)]);
      const seen = new Set(a ?? []);
      const shared = (b ?? []).filter((r) => seen.has(r));
      if (shared.length) overlaps.push(`${table}: ${shared.length}`);
    }
    expect(overlaps).toEqual([]);
  });

  it("login accounts and password hashes are unreadable outside the server", async () => {
    const outsider = await createTestUser(admin, created);
    for (const actor of [ANON, asUser(outsider.id)]) {
      expect(await visibleRows(actor, "auth.users")).toBeNull();
      expect(await visibleRows(actor, "public.notification_outbox")).toBeNull();
    }
    // my_login: بريد وجوال المستخدم نفسه فقط، دون تجزئة كلمة المرور
    const own = await dbFor(asUser(outsider.id)).query("select * from public.my_login()");
    expect(own).toHaveLength(1);
    expect(Object.keys(own[0]).sort()).toEqual(["email", "phone"]);
  });
});
