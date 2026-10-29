const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** معرّف uuid من حقل نموذج، أو null إن كان غائباً أو مشوّهاً (يُرفض قبل الوصول للقاعدة) */
export function uuidField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return isUuid(value) ? value : null;
}

export const INVALID_INPUT_MESSAGE = "بيانات غير صالحة.";
