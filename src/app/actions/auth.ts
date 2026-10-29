"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, serviceDb } from "@/lib/db/server";
import { endSession, getCurrentUser, startSession } from "@/lib/auth/session";
import { createAccount, verifyCredentials } from "@/lib/auth/accounts";
import {
  clearLoginFailures,
  clientIp,
  isLoginBlocked,
  RATE_LIMIT_MESSAGE,
  recordLoginFailure,
  takeRateLimit,
} from "@/lib/auth/rate-limit";
import { homePathForRole, safeNextPath } from "@/lib/auth/routes";
import { fieldErrors, onboardingSchema, signInSchema, signUpSchema } from "@/lib/auth/validation";

export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  /** القيم المُدخلة (عدا كلمة المرور) لإعادة تعبئة النموذج بعد الخطأ */
  values?: Record<string, string>;
};

function formValues(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  const values = formValues(formData, ["fullName", "identifier"]);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { fullName, identifier, password } = parsed.data;
  if (!takeRateLimit("signup", clientIp(await headers()))) {
    return { message: RATE_LIMIT_MESSAGE, values };
  }
  const result = await createAccount(identifier, password, fullName);
  if (!result.ok) {
    if (result.reason === "exists") {
      return { message: "هذا الحساب مسجّل مسبقاً، سجّل الدخول بدلاً من ذلك.", values };
    }
    return { message: "تعذّر إنشاء الحساب، حاول مرة أخرى.", values };
  }

  await startSession(result.userId);
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  const values = formValues(formData, ["identifier"]);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { identifier } = parsed.data;
  const ip = clientIp(await headers());
  const limitKeys = [
    `id:${identifier.kind === "email" ? identifier.email : identifier.phone}`,
    `ip:${ip}`,
  ];
  if (isLoginBlocked(limitKeys)) {
    return { message: "محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.", values };
  }

  const userId = await verifyCredentials(identifier, parsed.data.password);
  if (!userId) {
    recordLoginFailure(limitKeys);
    return { message: "بيانات الدخول غير صحيحة.", values };
  }
  clearLoginFailures(limitKeys);

  const profile = await serviceDb().maybeOne<{ suspended_at: string | null }>(
    "select suspended_at from public.profiles where id = $1",
    [userId],
  );
  if (profile?.suspended_at) {
    return { message: "هذا الحساب موقوف من الإدارة. تواصل مع الدعم.", values };
  }

  await startSession(userId);
  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function signOut() {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role) redirect(homePathForRole(user.role));

  const parsed = onboardingSchema.safeParse({
    role: formData.get("role"),
    accountType: formData.get("accountType") ?? undefined,
    establishmentName: formData.get("establishmentName") ?? undefined,
    crNumber: formData.get("crNumber") ?? undefined,
    city: formData.get("city") ?? undefined,
  });
  const values = formValues(formData, ["establishmentName", "crNumber", "city"]);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const input = parsed.data;
  const db = await getDb();
  const { error } = await db.rpc("complete_onboarding", {
    p_role: input.role,
    p_account_type: input.role === "requester" ? input.accountType : undefined,
    p_establishment_name:
      input.role === "requester" && input.accountType === "establishment"
        ? input.establishmentName
        : undefined,
    p_cr_number:
      input.role === "requester" && input.accountType === "establishment"
        ? input.crNumber
        : undefined,
    p_city: input.city,
  });

  if (error) {
    if (error.code === "23505") {
      return { errors: { crNumber: "رقم السجل التجاري مسجّل مسبقاً." }, values };
    }
    if (error.message.includes("already_onboarded")) {
      redirect("/dashboard");
    }
    return { message: "تعذّر حفظ اختيارك، حاول مرة أخرى.", values };
  }

  revalidatePath("/", "layout");
  redirect(homePathForRole(input.role));
}
