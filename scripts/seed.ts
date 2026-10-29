/**
 * ينشئ بيانات تجريبية: مدير، 4 مزوّدين، طالب خدمة فرد، طالب خدمة منشأة،
 * طلب عام مفتوح بعرض، و3 طلبات مكتملة بتقييمات متبادلة.
 * المزوّدون 1 و3 و4 معتمدون مع خدمات، والمزوّد 2 مُرسل وبانتظار التوثيق.
 * (فئات وأنواع الخدمات تأتي من migration لأنها بيانات مرجعية)
 *
 * التشغيل: npm run seed  (يقرأ .env.local)
 * آمن لإعادة التشغيل: يتخطى ما هو موجود.
 * على قاعدة بعيدة: SEED_ALLOW_REMOTE=1 وكلمة مرور خاصة SEED_PASSWORD (لا تُستخدم الافتراضية المنشورة).
 */
import { config } from "dotenv";
import { asUser, closePools, dbFor, SERVICE, type RpcResult } from "../src/lib/db/core";
import { createAccount, verifyCredentials } from "../src/lib/auth/accounts";
import { uploadObject } from "../src/lib/storage";
import type { Database } from "../src/lib/db/types";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL مطلوب في .env.local");
  process.exit(1);
}
const isLocal = ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(
    `رفض التشغيل على ${new URL(url).hostname}. السكربت للبيئة المحلية (SEED_ALLOW_REMOTE=1 للتجاوز).`,
  );
  process.exit(1);
}
if (!isLocal && !process.env.SEED_PASSWORD) {
  console.error("على قاعدة بعيدة حدّد SEED_PASSWORD (كلمة المرور الافتراضية منشورة في المستودع).");
  process.exit(1);
}

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Mueqeb#2026";

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

const service = dbFor(SERVICE);

function identifierOf(user: { email?: string; phone?: string }) {
  return user.email
    ? ({ kind: "email", email: user.email } as const)
    : ({ kind: "phone", phone: user.phone! } as const);
}

async function seedUser(user: SeedUser) {
  const created = await createAccount(identifierOf(user), SEED_PASSWORD, user.fullName, service);
  if (!created.ok) {
    console.log(`• ${user.label}: موجود مسبقاً`);
    return;
  }
  const id = created.userId;

  if (user.account) {
    const account = await service.one<{ id: string }>(
      `insert into public.requester_accounts (account_type, establishment_name, cr_number, created_by)
       values ($1, $2, $3, $4) returning id`,
      [
        user.account.type,
        user.account.type === "establishment" ? user.account.name : null,
        user.account.type === "establishment" ? user.account.crNumber : null,
        id,
      ],
    );
    await service.query(
      `insert into public.establishment_members (account_id, user_id, member_role)
       values ($1, $2, 'owner')`,
      [account.id, id],
    );
  }

  await service.query("update public.profiles set role = $2, city = $3 where id = $1", [
    id,
    user.role,
    user.city,
  ]);

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
  // المزوّد نفسه يرفع مستنداته (يمر بسياسات storage.objects كما في المنصة)
  const asProvider = dbFor(asUser(profileId));
  const provider = await asProvider.one<{ id: string }>(
    `insert into public.providers
       (profile_id, office_name, cr_number, municipal_license_number, cities, bio)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [profileId, p.officeName, p.crNumber, p.municipalLicenseNumber, p.cities, p.bio],
  );

  for (const docType of DOC_TYPES) {
    const path = `${provider.id}/${docType}-seed.pdf`;
    const { error } = await uploadObject(
      asProvider,
      "provider-documents",
      path,
      samplePdf(`SEED ${docType}`),
    );
    if (error) throw new Error(`upload ${docType}: ${error}`);
    await asProvider.query(
      `insert into public.provider_documents
         (provider_id, doc_type, storage_path, file_name, mime_type, size_bytes)
       values ($1, $2, $3, $4, 'application/pdf', 400)`,
      [provider.id, docType, path, `${docType}.pdf`],
    );
  }

  for (const s of p.services) {
    await asProvider.query(
      `insert into public.provider_services
         (provider_id, service_type_id, fee_halalas, duration_days, notes)
       select $1, t.id, $3, $4, $5 from public.service_types t where t.slug = $2`,
      [provider.id, s.slug, s.feeHalalas, s.durationDays, s.notes ?? null],
    );
  }

  await service.query(
    p.status === "approved"
      ? `update public.providers
         set verification_status = 'approved', submitted_at = now(), reviewed_at = now()
         where id = $1`
      : "update public.providers set submitted_at = now() where id = $1",
    [provider.id],
  );
}

/** جلسة بحساب seed (تتحقق من كلمة المرور ثم تعمل بهويته فتمر بنفس RLS) */
async function signedIn(identifier: { email: string } | { phone: string }) {
  const id = await verifyCredentials(
    "email" in identifier
      ? { kind: "email", email: identifier.email }
      : { kind: "phone", phone: identifier.phone },
    SEED_PASSWORD,
    service,
  );
  if (!id) throw new Error(`تعذّر الدخول: ${JSON.stringify(identifier)}`);
  return { id, db: dbFor(asUser(id)) };
}

function must<T>(result: RpcResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** طلب عام تجريبي من حساب المنشأة مع عرض من المزوّد 1 (عبر دوال المنصة نفسها) */
async function seedSampleRequest() {
  const { count } = await service.one<{ count: number }>(
    "select count(*) as count from public.service_requests where mode = 'public'",
  );
  if (count) {
    console.log("• طلب تجريبي: موجود مسبقاً");
    return;
  }

  const requester = await signedIn({ email: "establishment@mueqeb.test" });
  const account = await requester.db.one<{ id: string }>(
    "select id from public.requester_accounts limit 1",
  );
  const type = await requester.db.one<{ id: string; required_docs: string[] }>(
    "select id, required_docs from public.service_types where slug = 'qiwa_work_permit'",
  );
  const requestId = must(
    await requester.db.rpc("create_service_request", {
      p_requester_account_id: account.id,
      p_service_type_id: type.id,
      p_mode: "public",
      p_city: "الرياض",
      p_urgency: "urgent",
      p_description: "إصدار رخص عمل لثلاثة عمال جدد في مؤسسة مقاولات.",
      p_available_docs: type.required_docs.slice(0, 1),
      p_private_notes: "التواصل مع مدير الموارد البشرية بعد الترسية.",
    }),
  );

  const provider = await signedIn({ email: "provider1@mueqeb.test" });
  must(
    await provider.db.rpc("submit_bid", {
      p_request_id: requestId,
      p_fee_halalas: 45000,
      p_expected_gov_fees_halalas: 0,
      p_duration_days: 3,
      p_includes: "إصدار الرخص الثلاث ومتابعتها حتى التفعيل.",
      p_needs_from_client: "تفويض المكتب في قوى وصور إقامات العمال.",
    }),
  );
  console.log("✓ طلب تجريبي: طلب عام مفتوح (رخص عمل، الرياض) مع عرض من المزوّد 1");
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
  const account = await requester.db.one<{ id: string }>(
    "select id from public.requester_accounts limit 1",
  );
  const type = await requester.db.one<{ id: string }>(
    "select id from public.service_types where slug = $1",
    [opts.serviceSlug],
  );
  const providerRow = await service.one<{ id: string; cities: string[] }>(
    "select id, cities from public.providers where profile_id = $1",
    [provider.id],
  );

  const requestId = must(
    await requester.db.rpc("create_service_request", {
      p_requester_account_id: account.id,
      p_service_type_id: type.id,
      p_mode: "direct_listed",
      p_target_provider_id: providerRow.id,
      p_city: providerRow.cities[0],
    }),
  );

  const order = await service.one<{ id: string; total_paid_halalas: number }>(
    "select id, total_paid_halalas from public.orders where request_id = $1",
    [requestId],
  );
  const ref = `mock_pay_seed_${requestId}`;
  must(
    await service.rpc("register_payment_attempt", {
      p_order_id: order.id,
      p_gateway: "mock",
      p_provider_ref: ref,
      p_amount_halalas: order.total_paid_halalas,
    }),
  );
  must(
    await service.rpc("record_payment_result", {
      p_gateway: "mock",
      p_event_id: `evt_seed_${requestId}`,
      p_provider_ref: ref,
      p_status: "paid",
      p_amount_halalas: order.total_paid_halalas,
      p_currency: "SAR",
      p_gateway_payment_id: ref,
      p_raw: { seed: true },
    }),
  );

  must(await requester.db.rpc("confirm_delegation", { p_request_id: requestId }));
  must(await provider.db.rpc("start_execution", { p_request_id: requestId }));
  const path = `${requestId}/delivery_proof/seed.pdf`;
  const upload = await uploadObject(
    provider.db,
    "request-documents",
    path,
    samplePdf("SEED delivery proof"),
  );
  if (upload.error) throw new Error(`upload proof: ${upload.error}`);
  await provider.db.query(
    `insert into public.request_documents
       (request_id, kind, label, storage_path, file_name, mime_type, size_bytes, uploaded_by)
     values ($1, 'delivery_proof', 'إثبات الإنجاز', $2, 'proof.pdf', 'application/pdf', 400, $3)`,
    [requestId, path, provider.id],
  );
  must(
    await provider.db.rpc("submit_delivery", {
      p_request_id: requestId,
      p_note: "أُنجزت الخدمة وأُرفق الإثبات",
    }),
  );
  must(await requester.db.rpc("confirm_completion", { p_request_id: requestId }));

  const [speed, accuracy, communication] = opts.scores;
  must(
    await requester.db.rpc("submit_review", {
      p_request_id: requestId,
      p_speed: speed,
      p_accuracy: accuracy,
      p_communication: communication,
      p_comment: opts.comment,
    }),
  );
  must(
    await provider.db.rpc("submit_review", {
      p_request_id: requestId,
      p_request_clarity: 5,
      p_documents_speed: 4,
    }),
  );
}

async function seedCompletedOrders() {
  const { count } = await service.one<{ count: number }>(
    "select count(*) as count from public.reviews",
  );
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
  console.log(
    process.env.SEED_PASSWORD
      ? "\nكلمة المرور لكل الحسابات: SEED_PASSWORD"
      : `\nكلمة المرور لكل الحسابات: ${SEED_PASSWORD}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
