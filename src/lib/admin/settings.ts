import { z } from "zod";

/** الإعدادات الرقمية القابلة للتعديل من لوحة الإدارة وحدودها */
export const SETTINGS_SCHEMA = {
  provider_commission_pct: z.coerce.number().min(0, "0–50").max(50, "0–50"),
  client_fee_pct: z.coerce.number().min(0, "0–30").max(30, "0–30"),
  max_offers_per_order: z.coerce.number().int("عدد صحيح").min(1, "1–20").max(20, "1–20"),
  offer_window_hours: z.coerce.number().int("عدد صحيح").min(1, "1–168").max(168, "1–168"),
  award_window_hours: z.coerce.number().int("عدد صحيح").min(1, "1–720").max(720, "1–720"),
  delivery_confirmation_days: z.coerce.number().int("عدد صحيح").min(1, "1–30").max(30, "1–30"),
  cancel_after_start_provider_pct: z.coerce.number().min(0, "0–100").max(100, "0–100"),
  review_reveal_days: z.coerce.number().int("عدد صحيح").min(1, "1–60").max(60, "1–60"),
} as const;

export type EditableSettingKey = keyof typeof SETTINGS_SCHEMA;

export const SETTINGS_FIELDS: { key: EditableSettingKey; label: string; unit: string }[] = [
  { key: "provider_commission_pct", label: "عمولة المنصة من أتعاب المزوّد", unit: "%" },
  { key: "client_fee_pct", label: "رسم الخدمة على العميل", unit: "%" },
  { key: "max_offers_per_order", label: "الحد الأقصى للعروض على الطلب العام", unit: "عرض" },
  { key: "offer_window_hours", label: "مهلة تقديم العروض", unit: "ساعة" },
  { key: "award_window_hours", label: "مهلة اختيار العرض بعد انتهاء العروض", unit: "ساعة" },
  {
    key: "delivery_confirmation_days",
    label: "مهلة تأكيد العميل قبل الإكمال التلقائي",
    unit: "يوم",
  },
  {
    key: "cancel_after_start_provider_pct",
    label: "نسبة المزوّد عند الإلغاء بعد البدء",
    unit: "%",
  },
  { key: "review_reveal_days", label: "كشف التقييمات بعد", unit: "يوم" },
];
