import { z } from "zod";
import { isSaudiCity } from "@/lib/cities";
import {
  CONTACT_INFO_MESSAGE,
  CREDENTIALS_MESSAGE,
  containsContactInfo,
  mentionsCredentials,
} from "@/lib/contact-info";
import { parseSarToHalalas } from "@/lib/money";

const noContact = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .refine((v) => !containsContactInfo(v), CONTACT_INFO_MESSAGE)
    .refine((v) => !mentionsCredentials(v), CREDENTIALS_MESSAGE);

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const createRequestSchema = z
  .object({
    mode: z.enum(["direct_listed", "direct_quote", "public"]),
    accountId: z.uuid(),
    // الطلب العام نص حر بلا خدمة محددة؛ الطلب المباشر مرتبط بخدمة المكتب
    serviceTypeId: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    providerId: z.uuid().optional(),
    title: optionalText,
    authority: optionalText,
    city: z.string().trim(),
    urgency: z.enum(["normal", "urgent"]),
    description: noContact(1000, "الوصف طويل جداً (1000 حرف)"),
    availableDocs: z.array(z.string()).max(20),
    privateNotes: z
      .string()
      .trim()
      .max(2000, "الملاحظات طويلة جداً")
      .refine((v) => !mentionsCredentials(v), CREDENTIALS_MESSAGE)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const checkText = (path: string, value: string | undefined) => {
      if (value && containsContactInfo(value)) issue(path, CONTACT_INFO_MESSAGE);
      else if (value && mentionsCredentials(value)) issue(path, CREDENTIALS_MESSAGE);
    };

    if (v.mode === "public") {
      if (!v.title || v.title.length < 5) issue("title", "اكتب عنواناً لطلبك (5 أحرف على الأقل)");
      else if (v.title.length > 120) issue("title", "العنوان طويل جداً (120 حرفاً)");
      if (!v.authority || v.authority.length < 2)
        issue("authority", "اكتب الجهة المعنية، مثل: قوى أو بلدي");
      else if (v.authority.length > 80) issue("authority", "اسم الجهة طويل جداً");
      checkText("title", v.title);
      checkText("authority", v.authority);
      if (v.city.length < 2 || v.city.length > 40) issue("city", "اكتب المدينة");
      if (v.description.length < 10) {
        issue("description", "صف طلبك في 10 أحرف على الأقل لتفهمه المكاتب");
      }
    } else {
      if (!v.providerId) issue("providerId", "المكتب مطلوب للطلب المباشر");
      if (!v.serviceTypeId) issue("serviceTypeId", "اختر الخدمة");
      if (!isSaudiCity(v.city)) issue("city", "اختر المدينة");
    }
  });

/** المرفقات التوضيحية مع الطلب العام */
export const MAX_REQUEST_ATTACHMENTS = 5;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;

const sar = (message: string, allowZero: boolean) =>
  z.string().transform((v, ctx) => {
    if (allowZero && v.trim() === "") return 0;
    const halalas = parseSarToHalalas(v);
    if (halalas === null || (!allowZero && halalas <= 0)) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return halalas;
  });

export const bidSchema = z.object({
  requestId: z.uuid(),
  fee: sar("أدخل أتعابك بالريال", false),
  govFees: sar("أدخل مبلغاً صحيحاً أو اتركه فارغاً", true),
  durationDays: z.coerce
    .number({ message: "أدخل المدة بالأيام" })
    .int("المدة عدد صحيح من الأيام")
    .min(1, "المدة يوم واحد على الأقل")
    .max(365, "المدة سنة كحد أقصى"),
  includes: noContact(1000, "النص طويل جداً").pipe(z.string().min(5, "اذكر ما يشمله العرض")),
  needsFromClient: noContact(1000, "النص طويل جداً"),
});
