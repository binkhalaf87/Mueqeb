"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
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

function credentials(
  identifier: { kind: "email"; email: string } | { kind: "phone"; phone: string },
) {
  return identifier.kind === "email" ? { email: identifier.email } : { phone: identifier.phone };
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
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...credentials(identifier),
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    if (
      error.code === "user_already_exists" ||
      error.code === "phone_exists" ||
      error.code === "email_exists"
    ) {
      return { message: "هذا الحساب مسجّل مسبقاً، سجّل الدخول بدلاً من ذلك.", values };
    }
    if (error.code === "weak_password") {
      return { errors: { password: "كلمة المرور ضعيفة، اختر كلمة أقوى." }, values };
    }
    return { message: "تعذّر إنشاء الحساب، حاول مرة أخرى.", values };
  }

  if (!data.session) {
    // عند تفعيل تأكيد البريد/الجوال في Supabase
    return { message: "أنشأنا حسابك. أكّد بريدك الإلكتروني أو جوالك ثم سجّل الدخول." };
  }

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    ...credentials(parsed.data.identifier),
    password: parsed.data.password,
  });
  if (error) {
    return { message: "بيانات الدخول غير صحيحة.", values };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
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
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
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
