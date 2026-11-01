"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accountByEmail, changePassword, contactStatus } from "@/lib/auth/accounts";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/auth/account-emails";
import { consumeToken } from "@/lib/auth/one-time-tokens";
import {
  clearLoginFailures,
  clientIp,
  RATE_LIMIT_MESSAGE,
  takeRateLimit,
} from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { fieldErrors, passwordSchema } from "@/lib/auth/validation";
import type { FormState } from "./auth";

/** رد واحد سواء وُجد الحساب أم لا، فلا تكشف الصفحة البريد المسجّل */
const RESET_SENT =
  "إن كان هذا البريد مسجّلاً لدينا فستصلك رسالة برابط تعيين كلمة المرور خلال دقائق. تحقق من مجلد الرسائل غير المرغوبة.";

const resetRequestSchema = z.object({
  email: z.email("البريد الإلكتروني غير صحيح").transform((e) => e.toLowerCase()),
});

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "").trim() };
  const parsed = resetRequestSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { email } = parsed.data;
  const ip = clientIp(await headers());
  if (!takeRateLimit("password_reset", `ip:${ip}`) || !takeRateLimit("password_reset", email)) {
    return { message: RATE_LIMIT_MESSAGE, values };
  }

  const account = await accountByEmail(email);
  if (account) {
    await sendPasswordResetEmail({
      userId: account.id,
      email: account.email,
      name: account.full_name,
    });
  }
  return { message: RESET_SENT };
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "التأكيد لا يطابق كلمة المرور الجديدة",
    path: ["confirmPassword"],
  });

/** يعيّن كلمة المرور من رابط البريد ويُخرج كل الجلسات القائمة؛ ثم يدخل المستخدم من جديد */
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const owner = await consumeToken(parsed.data.token, "password_reset");
  if (!owner) {
    return { message: "الرابط غير صالح أو منتهٍ أو استُخدم من قبل. اطلب رابطاً جديداً." };
  }
  await changePassword(owner.userId, parsed.data.newPassword);
  clearLoginFailures([`id:${owner.email}`]);
  redirect("/login?reset=1");
}

/** يعيد إرسال رابط تأكيد البريد للمستخدم الحالي */
export async function resendVerificationEmail(): Promise<FormState> {
  const user = await requireUser();
  const contact = await contactStatus(user.id);
  if (!contact?.email) return { message: "أضف بريداً إلكترونياً من «حسابي» أولاً." };
  if (contact.emailVerified) return { message: "بريدك مؤكَّد." };
  if (!takeRateLimit("verify_email", user.id)) return { message: RATE_LIMIT_MESSAGE };

  const sent = await sendVerificationEmail({
    userId: user.id,
    email: contact.email,
    name: user.fullName,
  });
  return {
    message: sent
      ? `أرسلنا رابط التأكيد إلى ${contact.email}.`
      : "تعذّر إرسال الرسالة الآن، حاول بعد قليل.",
  };
}
