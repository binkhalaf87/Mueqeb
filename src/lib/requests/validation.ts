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

export const createRequestSchema = z
  .object({
    mode: z.enum(["direct_listed", "direct_quote", "public"]),
    accountId: z.uuid(),
    serviceTypeId: z.uuid("اختر الخدمة"),
    providerId: z.uuid().optional(),
    city: z.string().refine(isSaudiCity, "اختر المدينة"),
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
  .refine((v) => v.mode === "public" || Boolean(v.providerId), {
    message: "المزوّد مطلوب للطلب المباشر",
    path: ["providerId"],
  })
  .refine((v) => v.mode !== "public" || v.description.length >= 10, {
    message: "صف طلبك في 10 أحرف على الأقل ليفهمه المزوّدون",
    path: ["description"],
  });

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
