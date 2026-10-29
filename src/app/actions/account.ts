"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, startSession } from "@/lib/auth/session";
import { changeEmail, changePassword, verifyPasswordById } from "@/lib/auth/accounts";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/auth/rate-limit";
import { fieldErrors } from "@/lib/auth/validation";
import { attempt } from "@/lib/db/core";
import { getDb } from "@/lib/db/server";
import { isSaudiCity } from "@/lib/cities";
import { CREDENTIALS_MESSAGE, mentionsCredentials } from "@/lib/contact-info";
import type { FormState } from "./auth";

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "أدخل الاسم الكامل").max(120, "الاسم طويل جداً"),
  city: z
    .string()
    .trim()
    .refine((c) => c === "" || isSaudiCity(c), "اختر مدينة من القائمة"),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    city: String(formData.get("city") ?? ""),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const db = await getDb();
  const { error } = await attempt(
    db.query("update public.profiles set full_name = $2, city = $3 where id = $1", [
      user.id,
      parsed.data.fullName,
      parsed.data.city || null,
    ]),
  );
  if (error) return { message: "تعذّر حفظ البيانات، حاول مرة أخرى.", values };
  revalidatePath("/", "layout");
  return { message: "حُفظت بياناتك." };
}

const establishmentSchema = z.object({
  accountId: z.uuid(),
  establishmentName: z.string().trim().min(2, "أدخل اسم المنشأة").max(150, "الاسم طويل جداً"),
  about: z
    .string()
    .trim()
    .max(1000, "النبذة 1000 حرف كحد أقصى")
    .refine((v) => !mentionsCredentials(v), CREDENTIALS_MESSAGE),
});

/** بيانات المنشأة: يعدّلها مالك الحساب فقط (سياسة RLS "requester_accounts: owner updates") */
export async function updateEstablishment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const values = {
    establishmentName: String(formData.get("establishmentName") ?? ""),
    about: String(formData.get("about") ?? ""),
  };
  const parsed = establishmentSchema.safeParse({ ...values, accountId: formData.get("accountId") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const db = await getDb();
  const { data, error } = await attempt(
    db.query(
      `update public.requester_accounts set establishment_name = $2, about = $3
       where id = $1 and account_type = 'establishment' returning id`,
      [parsed.data.accountId, parsed.data.establishmentName, parsed.data.about || null],
    ),
  );
  if (error) return { message: "تعذّر حفظ بيانات المنشأة.", values };
  if (!data.length) return { message: "تعديل بيانات المنشأة متاح لمالك الحساب فقط.", values };
  revalidatePath("/dashboard", "layout");
  return { message: "حُفظت بيانات المنشأة." };
}

/** محاولات كلمة المرور الخاطئة هنا تُحسب ضمن حد الدخول نفسه */
async function checkCurrentPassword(userId: string, password: string) {
  const keys = [`pw:${userId}`];
  if (isLoginBlocked(keys)) return "blocked" as const;
  if (!(await verifyPasswordById(userId, password))) {
    recordLoginFailure(keys);
    return "wrong" as const;
  }
  clearLoginFailures(keys);
  return "ok" as const;
}

const PASSWORD_ERRORS = {
  blocked: "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.",
  wrong: "كلمة المرور الحالية غير صحيحة.",
};

const emailSchema = z.object({
  email: z.email("البريد الإلكتروني غير صحيح").transform((e) => e.toLowerCase()),
  currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية"),
});

export async function changeLoginEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { email: String(formData.get("email") ?? "").trim() };
  const parsed = emailSchema.safeParse({
    email: values.email,
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const check = await checkCurrentPassword(user.id, parsed.data.currentPassword);
  if (check !== "ok") return { errors: { currentPassword: PASSWORD_ERRORS[check] }, values };

  const result = await changeEmail(user.id, parsed.data.email);
  if (!result.ok) return { errors: { email: "هذا البريد مستخدم لحساب آخر." }, values };
  revalidatePath("/", "layout");
  return { message: "تغيّر بريد الدخول. استخدمه في المرة القادمة." };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية"),
    newPassword: z
      .string()
      .min(8, "كلمة المرور 8 أحرف على الأقل")
      .max(72, "كلمة المرور طويلة جداً"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "التأكيد لا يطابق كلمة المرور الجديدة",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "اختر كلمة مرور مختلفة عن الحالية",
    path: ["newPassword"],
  });

/** تغيير كلمة المرور يُبطل كل الجلسات الأخرى، ويُصدر جلسة جديدة لهذا الجهاز */
export async function changeLoginPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const check = await checkCurrentPassword(user.id, parsed.data.currentPassword);
  if (check !== "ok") return { errors: { currentPassword: PASSWORD_ERRORS[check] } };

  const version = await changePassword(user.id, parsed.data.newPassword);
  await startSession(user.id, version);
  return { message: "تغيّرت كلمة المرور، وخرجت جلساتك على الأجهزة الأخرى." };
}
