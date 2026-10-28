/**
 * ينشئ مستخدمين تجريبيين في Supabase المحلي:
 * مدير، مزوّدان، طالب خدمة فرد، طالب خدمة منشأة.
 *
 * التشغيل: npm run seed  (يقرأ .env.local)
 * آمن لإعادة التشغيل: يتخطى المستخدمين الموجودين.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SECRET_KEY مطلوبة في .env.local");
  process.exit(1);
}
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) &&
  process.env.SEED_ALLOW_REMOTE !== "1"
) {
  console.error(
    `رفض التشغيل على ${url}. السكربت للبيئة المحلية فقط (SEED_ALLOW_REMOTE=1 للتجاوز).`,
  );
  process.exit(1);
}

const SEED_PASSWORD = "Mueqeb#2026";

type SeedUser = {
  label: string;
  email?: string;
  phone?: string;
  fullName: string;
  city: string;
  role: Database["public"]["Enums"]["user_role"];
  account?: { type: "individual" } | { type: "establishment"; name: string; crNumber: string };
};

const USERS: SeedUser[] = [
  {
    label: "مدير",
    email: "admin@mueqeb.test",
    fullName: "مدير المنصة",
    city: "الرياض",
    role: "admin",
  },
  {
    label: "مزوّد 1",
    email: "provider1@mueqeb.test",
    fullName: "مكتب الإنجاز للخدمات العامة",
    city: "الرياض",
    role: "provider",
  },
  {
    label: "مزوّد 2",
    phone: "+966500000002",
    fullName: "مكتب السرعة للتعقيب",
    city: "جدة",
    role: "provider",
  },
  {
    label: "فرد",
    phone: "+966500000003",
    fullName: "سارة العتيبي",
    city: "الرياض",
    role: "requester",
    account: { type: "individual" },
  },
  {
    label: "منشأة",
    email: "establishment@mueqeb.test",
    fullName: "خالد الحربي",
    city: "الدمام",
    role: "requester",
    account: { type: "establishment", name: "مؤسسة البناء الحديث", crNumber: "2050123456" },
  },
];

const supabase = createClient<Database>(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserId(user: SeedUser): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const phone = user.phone?.replace(/^\+/, "");
  const found = data.users.find((u) => (user.email ? u.email === user.email : u.phone === phone));
  return found?.id ?? null;
}

async function seedUser(user: SeedUser) {
  let id = await findUserId(user);
  if (id) {
    console.log(`• ${user.label}: موجود مسبقاً`);
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    phone: user.phone,
    password: SEED_PASSWORD,
    email_confirm: Boolean(user.email),
    phone_confirm: Boolean(user.phone),
    user_metadata: { full_name: user.fullName },
  });
  if (error) throw error;
  id = data.user.id;

  if (user.account) {
    const { data: account, error: accError } = await supabase
      .from("requester_accounts")
      .insert({
        account_type: user.account.type,
        establishment_name: user.account.type === "establishment" ? user.account.name : null,
        cr_number: user.account.type === "establishment" ? user.account.crNumber : null,
        created_by: id,
      })
      .select("id")
      .single();
    if (accError) throw accError;

    const { error: memberError } = await supabase
      .from("establishment_members")
      .insert({ account_id: account.id, user_id: id, member_role: "owner" });
    if (memberError) throw memberError;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: user.role, city: user.city })
    .eq("id", id);
  if (profileError) throw profileError;

  console.log(`✓ ${user.label}: ${user.email ?? user.phone}`);
}

async function main() {
  for (const user of USERS) {
    await seedUser(user);
  }
  console.log(`\nكلمة المرور لكل الحسابات: ${SEED_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
