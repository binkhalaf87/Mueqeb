/** قائمة المدن المعتمدة للمرحلة الحالية (تُوسّع لاحقاً أو تُنقل لجدول) */
export const SAUDI_CITIES = [
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",
  "الدمام",
  "الخبر",
  "الظهران",
  "الأحساء",
  "القطيف",
  "الجبيل",
  "الطائف",
  "تبوك",
  "بريدة",
  "عنيزة",
  "حائل",
  "أبها",
  "خميس مشيط",
  "جازان",
  "نجران",
  "الباحة",
  "الجوف",
  "عرعر",
  "ينبع",
  "حفر الباطن",
] as const;

export type SaudiCity = (typeof SAUDI_CITIES)[number];

export function isSaudiCity(value: string): value is SaudiCity {
  return (SAUDI_CITIES as readonly string[]).includes(value);
}
