/**
 * كشف بيانات التواصل (جوال، بريد، روابط) في النصوص التي يراها المزوّدون قبل الترسية.
 * مطابق للدالة public.contains_contact_info في قاعدة البيانات (القاعدة هي المرجع النهائي).
 */
export function containsContactInfo(text: string | null | undefined): boolean {
  if (!text) return false;
  const digits = text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s\-.()]/g, "");
  return (
    /\d{9,}/.test(digits) ||
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text) ||
    /(https?:\/\/|www\.)/i.test(text) ||
    /\b[a-z0-9-]+\.(com|net|org|sa|io|me|info)\b/i.test(text)
  );
}

export const CONTACT_INFO_MESSAGE =
  "لا تكتب أرقام جوال أو بريداً إلكترونياً أو روابط. التواصل داخل المنصة فقط حتى الترسية.";

/**
 * قاعدة أمان: المنصة لا تطلب ولا تخزن كلمات مرور أو رموز تحقق للحسابات الحكومية.
 * مطابق للدالة public.mentions_credentials في قاعدة البيانات.
 */
export function mentionsCredentials(text: string | null | undefined): boolean {
  if (!text) return false;
  return /كلم[ةه]\s*(ال)?(مرور|سر)|رمز\s*(ال)?(تحقق|تفعيل|دخول)|الرقم\s*السري|باسورد|باسوورد|\botp\b|password|passcode|verification\s*code/i.test(
    text,
  );
}

export const CREDENTIALS_MESSAGE =
  "لا تطلب ولا تكتب كلمات مرور أو رموز تحقق للحسابات الحكومية. التفويض يتم عبر المنصات الرسمية فقط.";
