import type { Database } from "@/lib/db/types";

export type RequestStatus = Database["public"]["Enums"]["request_status"];
export type RequestMode = Database["public"]["Enums"]["request_mode"];
export type RequestUrgency = Database["public"]["Enums"]["request_urgency"];
export type BidStatus = Database["public"]["Enums"]["bid_status"];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "مسودة",
  open: "مفتوح",
  awarded_unpaid: "تم اختيار عرض — بانتظار الدفع",
  paid: "مدفوع",
  awaiting_client: "بانتظار التفويض والمستندات",
  in_progress: "قيد التنفيذ",
  delivered: "تم التسليم — بانتظار التأكيد",
  completed: "مكتمل",
  disputed: "نزاع",
  resolved: "تمت تسوية النزاع",
  cancelled: "ملغي",
  expired: "منتهي",
};

export const STATUS_TONE: Record<
  RequestStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  open: "info",
  awarded_unpaid: "warning",
  paid: "success",
  awaiting_client: "warning",
  in_progress: "info",
  delivered: "info",
  completed: "success",
  disputed: "danger",
  resolved: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

export const MODE_LABEL: Record<RequestMode, string> = {
  direct_listed: "طلب مباشر بالسعر المعلن",
  direct_quote: "طلب عرض خاص",
  public: "طلب عام",
};

export const URGENCY_LABEL: Record<RequestUrgency, string> = {
  normal: "عادي",
  urgent: "مستعجل",
};

export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  submitted: "مُقدّم",
  withdrawn: "مسحوب",
  accepted: "مقبول",
  rejected: "لم يُختر",
};

/** رسائل أخطاء دوال الطلبات والعروض في قاعدة البيانات */
const RPC_ERRORS: Record<string, string> = {
  contact_info_not_allowed:
    "لا تكتب أرقام جوال أو بريداً إلكترونياً أو روابط. التواصل داخل المنصة فقط حتى الترسية.",
  credentials_not_allowed:
    "لا تطلب ولا تكتب كلمات مرور أو رموز تحقق للحسابات الحكومية. التفويض يتم عبر المنصات الرسمية فقط.",
  invalid_available_docs: "اختر المستندات من القائمة فقط.",
  provider_does_not_offer_service: "هذا المزوّد لا يقدّم الخدمة حالياً.",
  service_type_not_found: "الخدمة غير متاحة.",
  fee_below_minimum: "الأتعاب أقل من الحد الأدنى لهذه الخدمة.",
  bids_limit_reached: "اكتمل العدد الأقصى للعروض على هذا الطلب.",
  bids_deadline_passed: "انتهت مهلة تقديم العروض.",
  request_not_open: "الطلب لم يعد مفتوحاً.",
  request_not_found: "الطلب غير متاح.",
  bid_locked: "لا يمكن تعديل العرض بعد الترسية.",
  bid_not_available: "هذا العرض لم يعد متاحاً.",
  provider_not_approved: "يجب اعتماد مكتبك قبل تقديم العروض.",
  invalid_transition: "لا يمكن تنفيذ هذا الإجراء في حالة الطلب الحالية.",
  forbidden_transition: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
};

export function rpcErrorMessage(
  error: { message: string },
  fallback = "تعذّر تنفيذ العملية، حاول مرة أخرى.",
) {
  const key = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k));
  return key ? RPC_ERRORS[key] : fallback;
}
