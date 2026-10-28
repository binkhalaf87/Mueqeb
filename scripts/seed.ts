/**
 * ينشئ مستخدمين تجريبيين في Supabase المحلي:
 * مدير، مزوّدان، طالب خدمة فرد، طالب خدمة منشأة.
 * المزوّد 1 معتمد مع خدمات، والمزوّد 2 مُرسل وبانتظار التوثيق.
 * (فئات وأنواع الخدمات تأتي من migration لأنها بيانات مرجعية)
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

type SeedProvider = {
  officeName: string;
  crNumber: string;
  municipalLicenseNumber: string;
  cities: string[];
  bio: string;
  status: "approved" | "under_review";
  services: { slug: string; feeHalalas: number; durationDays: number; notes?: string }[];
};

type SeedUser = {
  label: string;
  email?: string;
  phone?: string;
  fullName: string;
  city: string;
  role: Database["public"]["Enums"]["user_role"];
  account?: { type: "individual" } | { type: "establishment"; name: string; crNumber: string };
  provider?: SeedProvider;
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
    fullName: "عبدالله المطيري",
    city: "الرياض",
    role: "provider",
    provider: {
      officeName: "مكتب الإنجاز للخدمات العامة",
      crNumber: "1010765432",
      municipalLicenseNumber: "40021987",
      cities: ["الرياض", "الدمام"],
      bio: "مكتب خدمات عامة مرخّص منذ 2015، متخصص في خدمات المنشآت الصغيرة والمتوسطة في قوى والتأمينات وبلدي.",
      status: "approved",
      services: [
        { slug: "qiwa_work_permit", feeHalalas: 18000, durationDays: 3 },
        {
          slug: "qiwa_transfer_service",
          feeHalalas: 35000,
          durationDays: 5,
          notes: "يشمل متابعة موافقة العامل.",
        },
        { slug: "gosi_register_establishment", feeHalalas: 20000, durationDays: 2 },
        { slug: "cr_modify_activity", feeHalalas: 30000, durationDays: 4 },
        { slug: "balady_renew_license", feeHalalas: 25000, durationDays: 5 },
      ],
    },
  },
  {
    label: "مزوّد 2",
    phone: "+966500000002",
    fullName: "سلطان الغامدي",
    city: "جدة",
    role: "provider",
    provider: {
      officeName: "مكتب السرعة للتعقيب",
      crNumber: "4030112233",
      municipalLicenseNumber: "51007744",
      cities: ["جدة", "مكة المكرمة"],
      bio: "خدمات تعقيب سريعة لمنشآت جدة ومكة.",
      status: "under_review",
      services: [
        { slug: "balady_shop_license", feeHalalas: 60000, durationDays: 10 },
        { slug: "mudad_monthly_payroll", feeHalalas: 12000, durationDays: 1 },
      ],
    },
  },
  {
    label: "مزوّد 3",
    email: "provider3@mueqeb.test",
    fullName: "فيصل القحطاني",
    city: "الرياض",
    role: "provider",
    provider: {
      officeName: "مكتب الريادة للخدمات العامة",
      crNumber: "1010554433",
      municipalLicenseNumber: "40099881",
      cities: ["الرياض"],
      bio: "خبرة 10 سنوات في خدمات قوى ومدد للمنشآت.",
      status: "approved",
      services: [
        { slug: "qiwa_work_permit", feeHalalas: 15000, durationDays: 2 },
        { slug: "mudad_wage_protection_setup", feeHalalas: 25000, durationDays: 3 },
      ],
    },
  },
  {
    label: "مزوّد 4",
    email: "provider4@mueqeb.test",
    fullName: "ماجد الشمري",
    city: "الرياض",
    role: "provider",
    provider: {
      officeName: "مكتب المسار للتعقيب",
      crNumber: "1010443322",
      municipalLicenseNumber: "40077665",
      cities: ["الرياض", "حائل"],
      bio: "نخدم منشآت الرياض وحائل في قوى والسجل التجاري.",
      status: "approved",
      services: [
        { slug: "qiwa_work_permit", feeHalalas: 20000, durationDays: 4 },
        { slug: "cr_modify_activity", feeHalalas: 28000, durationDays: 3 },
      ],
    },
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

  if (user.provider) await seedProvider(id, user.provider);

  console.log(`✓ ${user.label}: ${user.email ?? user.phone}`);
}

/** ملف PDF صغير صالح يُستخدم كمستند تجريبي */
function samplePdf(title: string) {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 18 Tf 20 70 Td (${title}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}

const DOC_TYPES = [
  "commercial_register",
  "municipal_license",
  "manager_id",
  "iban_certificate",
] as const;

async function seedProvider(profileId: string, p: SeedProvider) {
  const { data: provider, error } = await supabase
    .from("providers")
    .insert({
      profile_id: profileId,
      office_name: p.officeName,
      cr_number: p.crNumber,
      municipal_license_number: p.municipalLicenseNumber,
      cities: p.cities,
      bio: p.bio,
    })
    .select("id")
    .single();
  if (error) throw error;

  for (const docType of DOC_TYPES) {
    const path = `${provider.id}/${docType}-seed.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("provider-documents")
      .upload(path, samplePdf(`SEED ${docType}`), { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const { error: docError } = await supabase.from("provider_documents").insert({
      provider_id: provider.id,
      doc_type: docType,
      storage_path: path,
      file_name: `${docType}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 400,
    });
    if (docError) throw docError;
  }

  const { data: types, error: typesError } = await supabase
    .from("service_types")
    .select("id, slug")
    .in(
      "slug",
      p.services.map((s) => s.slug),
    );
  if (typesError) throw typesError;
  const idBySlug = new Map(types.map((t) => [t.slug, t.id]));

  const { error: servicesError } = await supabase.from("provider_services").insert(
    p.services.map((s) => ({
      provider_id: provider.id,
      service_type_id: idBySlug.get(s.slug)!,
      fee_halalas: s.feeHalalas,
      duration_days: s.durationDays,
      notes: s.notes ?? null,
    })),
  );
  if (servicesError) throw servicesError;

  const now = new Date().toISOString();
  const { error: statusError } = await supabase
    .from("providers")
    .update(
      p.status === "approved"
        ? { verification_status: "approved", submitted_at: now, reviewed_at: now }
        : { submitted_at: now },
    )
    .eq("id", provider.id);
  if (statusError) throw statusError;
}

/** طلب عام تجريبي من حساب المنشأة مع عرض من المزوّد 1 (عبر دوال المنصة نفسها) */
async function seedSampleRequest() {
  const { count } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true });
  if (count) {
    console.log("• طلب تجريبي: موجود مسبقاً");
    return;
  }

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const as = async (email: string) => {
    const client = createClient<Database>(url!, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
    if (error) throw error;
    return client;
  };

  const requester = await as("establishment@mueqeb.test");
  const { data: account } = await requester.from("requester_accounts").select("id").single();
  const { data: type } = await requester
    .from("service_types")
    .select("id, required_docs")
    .eq("slug", "qiwa_work_permit")
    .single();
  const { data: requestId, error } = await requester.rpc("create_service_request", {
    p_requester_account_id: account!.id,
    p_service_type_id: type!.id,
    p_mode: "public",
    p_city: "الرياض",
    p_urgency: "urgent",
    p_description: "إصدار رخص عمل لثلاثة عمال جدد في مؤسسة مقاولات.",
    p_available_docs: type!.required_docs.slice(0, 1),
    p_private_notes: "التواصل مع مدير الموارد البشرية بعد الترسية.",
  });
  if (error) throw error;

  const provider = await as("provider1@mueqeb.test");
  const { error: bidError } = await provider.rpc("submit_bid", {
    p_request_id: requestId,
    p_fee_halalas: 45000,
    p_expected_gov_fees_halalas: 0,
    p_duration_days: 3,
    p_includes: "إصدار الرخص الثلاث ومتابعتها حتى التفعيل.",
    p_needs_from_client: "تفويض المكتب في قوى وصور إقامات العمال.",
  });
  if (bidError) throw bidError;
  console.log("✓ طلب تجريبي: طلب عام مفتوح (رخص عمل، الرياض) مع عرض من المزوّد 1");
}

/** عميل مسجّل الدخول بحساب seed (يمر بنفس صلاحيات المنصة وRLS) */
async function signedIn(identifier: { email: string } | { phone: string }) {
  const client = createClient<Database>(url!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    ...identifier,
    password: SEED_PASSWORD,
  });
  if (error) throw error;
  return client;
}

/**
 * طلب مكتمل عبر الدورة الكاملة (دفع تجريبي، تفويض، تنفيذ، تسليم، تأكيد) ثم تقييم متبادل،
 * ليظهر في إحصاءات المكتب وترتيبه.
 */
async function seedCompletedOrder(opts: {
  providerEmail: string;
  requester: { email: string } | { phone: string };
  serviceSlug: string;
  scores: [number, number, number];
  comment: string;
}) {
  const requester = await signedIn(opts.requester);
  const provider = await signedIn({ email: opts.providerEmail });
  const { data: account } = await requester.from("requester_accounts").select("id").single();
  const { data: type } = await requester
    .from("service_types")
    .select("id")
    .eq("slug", opts.serviceSlug)
    .single();
  const { data: providerRow } = await supabase
    .from("providers")
    .select("id, cities, profile_id")
    .eq("profile_id", (await provider.auth.getUser()).data.user!.id)
    .single();

  const { data: requestId, error } = await requester.rpc("create_service_request", {
    p_requester_account_id: account!.id,
    p_service_type_id: type!.id,
    p_mode: "direct_listed",
    p_target_provider_id: providerRow!.id,
    p_city: providerRow!.cities[0],
  });
  if (error) throw error;

  const { data: order } = await supabase
    .from("orders")
    .select("id, total_paid_halalas")
    .eq("request_id", requestId!)
    .single();
  const ref = `mock_pay_seed_${requestId}`;
  await supabase.rpc("register_payment_attempt", {
    p_order_id: order!.id,
    p_gateway: "mock",
    p_provider_ref: ref,
    p_amount_halalas: order!.total_paid_halalas,
  });
  await supabase.rpc("record_payment_result", {
    p_gateway: "mock",
    p_event_id: `evt_seed_${requestId}`,
    p_provider_ref: ref,
    p_status: "paid",
    p_amount_halalas: order!.total_paid_halalas,
    p_currency: "SAR",
    p_gateway_payment_id: ref,
    p_raw: { seed: true },
  });

  await requester.rpc("confirm_delegation", { p_request_id: requestId! });
  const step = await provider.rpc("start_execution", { p_request_id: requestId! });
  if (step.error) throw step.error;
  const path = `${requestId}/delivery_proof/seed.pdf`;
  await provider.storage.from("request-documents").upload(path, samplePdf("SEED delivery proof"), {
    contentType: "application/pdf",
  });
  await provider.from("request_documents").insert({
    request_id: requestId!,
    kind: "delivery_proof",
    label: "إثبات الإنجاز",
    storage_path: path,
    file_name: "proof.pdf",
    mime_type: "application/pdf",
    size_bytes: 400,
    uploaded_by: providerRow!.profile_id,
  });
  const delivered = await provider.rpc("submit_delivery", {
    p_request_id: requestId!,
    p_note: "أُنجزت الخدمة وأُرفق الإثبات",
  });
  if (delivered.error) throw delivered.error;
  const completed = await requester.rpc("confirm_completion", { p_request_id: requestId! });
  if (completed.error) throw completed.error;

  const [speed, accuracy, communication] = opts.scores;
  await requester.rpc("submit_review", {
    p_request_id: requestId!,
    p_speed: speed,
    p_accuracy: accuracy,
    p_communication: communication,
    p_comment: opts.comment,
  });
  await provider.rpc("submit_review", {
    p_request_id: requestId!,
    p_request_clarity: 5,
    p_documents_speed: 4,
  });
}

async function seedCompletedOrders() {
  const { count } = await supabase.from("reviews").select("id", { count: "exact", head: true });
  if (count) {
    console.log("• طلبات مكتملة وتقييمات: موجودة مسبقاً");
    return;
  }
  await seedCompletedOrder({
    providerEmail: "provider1@mueqeb.test",
    requester: { email: "establishment@mueqeb.test" },
    serviceSlug: "gosi_register_establishment",
    scores: [5, 5, 4],
    comment: "إنجاز سريع ومتابعة ممتازة.",
  });
  await seedCompletedOrder({
    providerEmail: "provider1@mueqeb.test",
    requester: { phone: "+966500000003" },
    serviceSlug: "cr_modify_activity",
    scores: [4, 5, 5],
    comment: "دقيقون في التفاصيل.",
  });
  await seedCompletedOrder({
    providerEmail: "provider3@mueqeb.test",
    requester: { email: "establishment@mueqeb.test" },
    serviceSlug: "mudad_wage_protection_setup",
    scores: [3, 4, 3],
    comment: "تأخر الرد قليلاً لكن أُنجزت الخدمة.",
  });
  console.log("✓ طلبات مكتملة: 3 (مع تقييمات متبادلة منشورة)");
}

async function main() {
  for (const user of USERS) {
    await seedUser(user);
  }
  await seedSampleRequest();
  await seedCompletedOrders();
  console.log(`\nكلمة المرور لكل الحسابات: ${SEED_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
