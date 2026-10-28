import { z } from "zod";
import { isSaudiCity } from "@/lib/cities";
import { parseSarToHalalas } from "@/lib/money";
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES, DOCUMENT_TYPES } from "./constants";

const arabicDigits = (v: string) => v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export const providerProfileSchema = z.object({
  officeName: z.string().trim().min(2, "أدخل اسم المكتب").max(150, "الاسم طويل جداً"),
  crNumber: z
    .string()
    .trim()
    .transform(arabicDigits)
    .pipe(z.string().regex(/^\d{10}$/, "رقم السجل التجاري 10 أرقام")),
  municipalLicenseNumber: z
    .string()
    .trim()
    .transform(arabicDigits)
    .pipe(z.string().regex(/^[0-9A-Za-z-]{4,30}$/, "رقم الرخصة البلدية غير صحيح")),
  cities: z
    .array(z.string())
    .min(1, "اختر مدينة واحدة على الأقل")
    .max(30)
    .refine((cities) => cities.every(isSaudiCity), "مدينة غير معروفة"),
  bio: z
    .string()
    .trim()
    .max(1000, "النبذة طويلة جداً (1000 حرف)")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const providerServiceSchema = z.object({
  serviceTypeId: z.uuid("اختر الخدمة"),
  fee: z.string().transform((v, ctx) => {
    const halalas = parseSarToHalalas(v);
    if (halalas === null || halalas <= 0) {
      ctx.addIssue({ code: "custom", message: "أدخل مبلغاً صحيحاً بالريال" });
      return z.NEVER;
    }
    return halalas;
  }),
  durationDays: z.coerce
    .number({ message: "أدخل المدة بالأيام" })
    .int("المدة عدد صحيح من الأيام")
    .min(1, "المدة يوم واحد على الأقل")
    .max(365, "المدة سنة كحد أقصى"),
  notes: z
    .string()
    .trim()
    .max(500, "الملاحظات طويلة جداً")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const documentTypeSchema = z.enum(
  DOCUMENT_TYPES.map((d) => d.type) as [string, ...string[]],
);

export function validateDocumentFile(file: unknown): string | null {
  if (!(file instanceof File) || file.size === 0) return "اختر ملفاً";
  if (file.size > MAX_DOCUMENT_BYTES) return "الحد الأقصى لحجم الملف 5 ميجابايت";
  if (!(file.type in ALLOWED_DOCUMENT_MIME)) return "الصيغ المسموحة: PDF أو JPG أو PNG";
  return null;
}

export const reviewSchema = z
  .object({
    providerId: z.uuid(),
    action: z.enum(["approve", "reject", "suspend"]),
    reason: z
      .string()
      .trim()
      .max(500, "السبب طويل جداً")
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.action === "approve" || Boolean(v.reason), {
    message: "اكتب السبب",
    path: ["reason"],
  });
