import { z } from "zod";

/**
 * يحوّل رقم جوال سعودي إلى صيغة E.164 (+9665XXXXXXXX).
 * يقبل: 05XXXXXXXX أو 5XXXXXXXX أو 9665XXXXXXXX أو +9665XXXXXXXX أو 009665XXXXXXXX
 */
export function normalizeSaudiPhone(input: string): string | null {
  const digits = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s\-()]/g, "")
    .replace(/^\+/, "")
    .replace(/^00/, "");
  const match = /^(?:966|0)?(5\d{8})$/.exec(digits);
  return match ? `+966${match[1]}` : null;
}

export type Identifier = { kind: "email"; email: string } | { kind: "phone"; phone: string };

/** حقل واحد يقبل البريد الإلكتروني أو الجوال */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, "أدخل الجوال أو البريد الإلكتروني")
  .transform((value, ctx): Identifier => {
    if (value.includes("@")) {
      const parsed = z.email().safeParse(value.toLowerCase());
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "البريد الإلكتروني غير صحيح" });
        return z.NEVER;
      }
      return { kind: "email", email: parsed.data };
    }
    const phone = normalizeSaudiPhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "رقم الجوال غير صحيح (مثال: 05XXXXXXXX)" });
      return z.NEVER;
    }
    return { kind: "phone", phone };
  });

const passwordSchema = z
  .string()
  .min(8, "كلمة المرور 8 أحرف على الأقل")
  .max(72, "كلمة المرور طويلة جداً");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "أدخل الاسم الكامل").max(120, "الاسم طويل جداً"),
  identifier: identifierSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, "أدخل كلمة المرور"),
});

const citySchema = z
  .string()
  .trim()
  .max(60, "اسم المدينة طويل جداً")
  .optional()
  .transform((v) => (v ? v : undefined));

const requesterSchema = z.discriminatedUnion("accountType", [
  z.object({
    role: z.literal("requester"),
    accountType: z.literal("individual"),
    city: citySchema,
  }),
  z.object({
    role: z.literal("requester"),
    accountType: z.literal("establishment"),
    establishmentName: z
      .string()
      .trim()
      .min(2, "أدخل اسم المنشأة")
      .max(150, "اسم المنشأة طويل جداً"),
    crNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "رقم السجل التجاري 10 أرقام"),
    city: citySchema,
  }),
]);

export const onboardingSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("provider"), city: citySchema }),
  requesterSchema,
]);

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** يحوّل أخطاء zod إلى رسالة لكل حقل */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
