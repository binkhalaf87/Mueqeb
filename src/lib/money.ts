/** كل المبالغ في النظام أعداد صحيحة بالهللة (1 ريال = 100 هللة). */

/**
 * يحوّل نصاً بالريال (مثل "150" أو "150.5" أو "١٥٠") إلى هللات بدون أي حساب عشري.
 * يعيد null إن كان النص غير صالح.
 */
export function parseSarToHalalas(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫,]/g, ".");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const riyals = Number.parseInt(match[1], 10);
  const halalas = Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10);
  return riyals * 100 + halalas;
}

/** يعرض الهللات كريالات: 15000 → "150 ر.س" و 15050 → "150.50 ر.س" */
export function formatHalalas(halalas: number): string {
  const riyals = Math.trunc(halalas / 100);
  const rest = Math.abs(halalas % 100);
  const riyalsText = riyals.toLocaleString("en-US");
  return rest === 0 ? `${riyalsText} ر.س` : `${riyalsText}.${String(rest).padStart(2, "0")} ر.س`;
}

/** قيمة حقل إدخال بالريال من هللات: 15050 → "150.50" */
export function halalasToInput(halalas: number): string {
  const rest = halalas % 100;
  return rest === 0
    ? String(halalas / 100)
    : `${Math.trunc(halalas / 100)}.${String(rest).padStart(2, "0")}`;
}
