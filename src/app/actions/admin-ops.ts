"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getDb, serviceDb } from "@/lib/db/server";
import { attempt } from "@/lib/db/core";
import { parseSarToHalalas } from "@/lib/money";
import { SETTINGS_SCHEMA, type EditableSettingKey } from "@/lib/admin/settings";
import type { FormState } from "./auth";

const ERRORS: Record<string, string> = {
  amount_changed: "تغيّر رصيد المستحقات منذ فتح الصفحة؛ حدّث الصفحة وتحقق من المبلغ.",
  nothing_to_pay: "لا توجد مستحقات لهذا المزوّد.",
  bank_reference_required: "أدخل مرجع التحويل البنكي.",
  cannot_suspend_admin: "لا يمكن إيقاف حساب إدارة.",
  reason_required: "اكتب سبب الإيقاف.",
};

function errorMessage(error: { message: string }, fallback = "تعذّر تنفيذ العملية.") {
  const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
  return key ? ERRORS[key] : fallback;
}

function issues(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message]));
}

// ============ صرف المستحقات ============

export async function recordPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("admin");
  const parsed = z
    .object({
      providerId: z.uuid(),
      expected: z.coerce.number().int().positive(),
      bankReference: z.string().trim().min(3, "أدخل مرجع التحويل البنكي").max(100),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({
      providerId: formData.get("providerId"),
      expected: formData.get("expected"),
      bankReference: formData.get("bankReference"),
      note: formData.get("note") ?? undefined,
    });
  if (!parsed.success) return { errors: issues(parsed.error) };

  // كتابة مالية: بمفتاح الخدمة عبر دالة القاعدة، مع هوية المدير للتدقيق
  const { error } = await serviceDb().rpc("record_provider_payout", {
    p_provider_id: parsed.data.providerId,
    p_expected_halalas: parsed.data.expected,
    p_bank_reference: parsed.data.bankReference,
    p_admin_id: admin.id,
    p_note: parsed.data.note,
  });
  if (error) return { message: errorMessage(error) };
  revalidatePath("/admin", "layout");
  return { message: "سُجّل الصرف وقُيّد في الدفتر." };
}

// ============ الإعدادات ============

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const raw = Object.fromEntries(
    (Object.keys(SETTINGS_SCHEMA) as EditableSettingKey[]).map((k) => [k, formData.get(k)]),
  );
  const parsed = z.object(SETTINGS_SCHEMA).safeParse(raw);
  if (!parsed.success) return { errors: issues(parsed.error) };

  const db = await getDb();
  const current = await db.query<{ key: string; value: unknown }>(
    "select key, value from public.settings",
  );
  const currentByKey = new Map(current.map((s) => [s.key, s.value]));
  let changed = 0;
  // التحديث بصلاحيات المدير نفسه حتى يسجّل trigger التدقيق هويته
  for (const [key, value] of Object.entries(parsed.data)) {
    if (Number(currentByKey.get(key)) === value) continue;
    const { error } = await attempt(
      db.query("update public.settings set value = $2::jsonb, updated_at = now() where key = $1", [
        key,
        JSON.stringify(value),
      ]),
    );
    if (error) return { message: "تعذّر حفظ الإعدادات." };
    changed++;
  }
  revalidatePath("/admin", "layout");
  return { message: changed ? `حُفظت ${changed} إعدادات.` : "لا تغييرات." };
}

// ============ أنواع الخدمات ============

const halalas = (label: string) =>
  z.string().transform((v, ctx) => {
    const h = parseSarToHalalas(v);
    if (h === null || h <= 0) {
      ctx.addIssue({ code: "custom", message: `أدخل ${label} بالريال` });
      return z.NEVER;
    }
    return h;
  });

const serviceTypeSchema = z
  .object({
    id: z.uuid().optional(),
    categoryId: z.uuid("اختر الفئة"),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,60}$/, "معرّف لاتيني صغير وأرقام وشرطة سفلية"),
    nameAr: z.string().trim().min(2, "أدخل الاسم").max(120),
    description: z.string().trim().max(500).optional(),
    minFee: halalas("الحد الأدنى"),
    guideMin: halalas("بداية النطاق"),
    guideMax: halalas("نهاية النطاق"),
    requiredDocs: z
      .string()
      .transform((v) =>
        v
          .split("\n")
          .map((d) => d.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(120)).max(20)),
    delegation: z.enum(["qiwa", "balady", "mc", "none"]),
    active: z.boolean(),
  })
  .refine((v) => v.guideMin >= v.minFee, {
    message: "بداية النطاق الاسترشادي لا تقل عن الحد الأدنى",
    path: ["guideMin"],
  })
  .refine((v) => v.guideMax >= v.guideMin, {
    message: "نهاية النطاق لا تقل عن بدايته",
    path: ["guideMax"],
  });

export async function saveServiceType(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = serviceTypeSchema.safeParse({
    id: formData.get("id") || undefined,
    categoryId: formData.get("categoryId"),
    slug: formData.get("slug"),
    nameAr: formData.get("nameAr"),
    description: formData.get("description") ?? undefined,
    minFee: formData.get("minFee") ?? "",
    guideMin: formData.get("guideMin") ?? "",
    guideMax: formData.get("guideMax") ?? "",
    requiredDocs: formData.get("requiredDocs") ?? "",
    delegation: formData.get("delegation"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { errors: issues(parsed.error) };
  const v = parsed.data;
  const fields = [
    v.nameAr,
    v.description || null,
    v.minFee,
    v.guideMin,
    v.guideMax,
    v.requiredDocs,
    v.delegation,
    v.active,
  ];

  const db = await getDb();
  const { error } = v.id
    ? await attempt(
        db.query(
          `update public.service_types
           set name_ar = $2, description = $3, min_fee_halalas = $4, guide_min_halalas = $5,
               guide_max_halalas = $6, required_docs = $7, delegation_platform = $8, active = $9
           where id = $1`,
          [v.id, ...fields],
        ),
      )
    : await attempt(
        db.query(
          `insert into public.service_types
             (category_id, slug, name_ar, description, min_fee_halalas, guide_min_halalas,
              guide_max_halalas, required_docs, delegation_platform, active)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [v.categoryId, v.slug, ...fields],
        ),
      );
  if (error) {
    if (error.code === "23505") return { errors: { slug: "المعرّف مستخدم لخدمة أخرى." } };
    return { message: "تعذّر حفظ الخدمة." };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/providers", "layout");
  return { message: v.id ? "حُفظت التعديلات." : "أُضيفت الخدمة." };
}

// ============ إيقاف المستخدمين ============

export async function setSuspension(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("admin");
  const suspend = formData.get("suspend") === "true";
  const parsed = z
    .object({ profileId: z.uuid(), reason: z.string().trim().max(500) })
    .safeParse({ profileId: formData.get("profileId"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return { message: "بيانات غير صالحة." };
  if (suspend && parsed.data.reason.length < 3) return { errors: { reason: "اكتب سبب الإيقاف." } };

  // الإيقاف يمنع الدخول الجديد (فحص عند الدخول) ويحوّل الجلسات القائمة لصفحة الإيقاف (requireRole)
  const { error } = await serviceDb().rpc("set_user_suspension", {
    p_profile_id: parsed.data.profileId,
    p_suspend: suspend,
    p_reason: parsed.data.reason,
    p_admin_id: admin.id,
  });
  if (error) return { message: errorMessage(error) };

  revalidatePath("/admin", "layout");
  revalidatePath("/providers", "layout");
  return { message: suspend ? "أُوقف الحساب." : "أُعيد تفعيل الحساب." };
}
