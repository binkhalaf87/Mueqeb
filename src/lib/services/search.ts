/**
 * بحث الخدمات: يطابق الاسم والوصف، ومرادفات شائعة يكتبها أصحاب المنشآت.
 * المرادفات تساعد على الوصول للخدمة فقط ولا تُعرض كأسماء رسمية.
 */
export const SERVICE_SYNONYMS: Record<string, string[]> = {
  qiwa_work_permit: ["رخصة عمل", "رخص العمل", "تجديد رخصة العمل", "اقامة", "إقامة", "قوى"],
  qiwa_transfer_service: ["نقل كفالة", "نقل الكفالة", "نقل عامل", "نقل موظف", "نقل خدمات"],
  qiwa_change_occupation: ["تعديل مهنة", "تغيير المهنة", "المسمى الوظيفي"],
  qiwa_saudization_certificate: ["نطاقات", "شهادة نطاقات", "التوطين"],
  qiwa_contract_authentication: ["عقد عمل", "توثيق العقد", "عقود"],
  gosi_register_establishment: ["تأمينات", "التامينات", "فتح ملف تأمينات", "جوسي"],
  gosi_add_remove_contributor: ["إضافة موظف للتأمينات", "تسجيل موظف", "استبعاد موظف", "مشترك"],
  gosi_compliance_certificate: ["شهادة تأمينات", "شهادة التزام", "شهادة التأمينات"],
  mudad_wage_protection_setup: ["حماية الأجور", "مدد", "تسجيل مدد"],
  mudad_monthly_payroll: ["رواتب", "مسير رواتب", "ملف الرواتب", "ملف الأجور"],
  cr_issue: ["سجل تجاري جديد", "فتح سجل", "إصدار سجل", "مؤسسة فردية"],
  cr_modify_activity: ["إضافة نشاط", "تعديل نشاط", "حذف نشاط"],
  cr_confirm: ["تأكيد السجل", "تجديد السجل", "تأكيد البيانات"],
  balady_shop_license: ["رخصة محل", "رخصة بلدية", "فتح محل", "بلدي"],
  balady_renew_license: ["تجديد رخصة محل", "تجديد رخصة بلدية", "تجديد البلدية"],
  balady_health_certificate: ["كرت صحي", "شهادة صحية", "الشهادة الصحية"],
};

/** توحيد الكتابة العربية: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والمسافات */
export function normalizeArabic(text: string) {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type SearchableService = { slug: string; name_ar: string; description: string | null };

/** هل تطابق الخدمة عبارة البحث (كل كلمات البحث موجودة في الاسم أو الوصف أو مرادف واحد)؟ */
export function matchesService(service: SearchableService, query: string) {
  const q = normalizeArabic(query);
  if (!q) return true;
  const words = q.split(" ");
  const haystacks = [
    `${service.name_ar} ${service.description ?? ""}`,
    ...(SERVICE_SYNONYMS[service.slug] ?? []),
  ].map(normalizeArabic);
  return haystacks.some((h) => words.every((w) => h.includes(w)));
}

/** المنصة الرسمية ذات الصلة بكل مجموعة خدمات (للعرض فقط؛ المنصة جهة مستقلة عن مُعقّب) */
export const CATEGORY_PLATFORM: Record<string, string> = {
  qiwa: "منصة قوى",
  gosi: "المؤسسة العامة للتأمينات الاجتماعية",
  mudad: "منصة مدد",
  commercial_register: "منصة وزارة التجارة",
  balady: "منصة بلدي",
};
