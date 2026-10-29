/**
 * حد محاولات الدخول الفاشلة (بديل حماية مزوّد الهوية): 10 محاولات فاشلة لكل حساب ولكل عنوان IP
 * خلال 15 دقيقة. في ذاكرة الخادم: يكفي لنسخة خادم واحدة على Railway.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function isLoginBlocked(keys: string[], now = Date.now()) {
  return keys.some((k) => recent(k, now).length >= MAX_FAILURES);
}

export function recordLoginFailure(keys: string[], now = Date.now()) {
  for (const k of keys) failures.set(k, [...recent(k, now), now]);
}

export function clearLoginFailures(keys: string[]) {
  for (const k of keys) failures.delete(k);
}

/**
 * حدود عامة بنافذة منزلقة لكل مفتاح (مستخدم أو IP): يعيد true ويحتسب المحاولة إن كانت ضمن الحد.
 * القيم الحالية في RATE_LIMITS؛ في ذاكرة الخادم مثل حد الدخول.
 */
const events = new Map<string, number[]>();

export const RATE_LIMITS = {
  signup: { limit: 5, windowMs: 60 * 60_000 }, // لكل IP في الساعة
  message: { limit: 20, windowMs: 60_000 }, // لكل مستخدم في الدقيقة
  bid: { limit: 30, windowMs: 10 * 60_000 }, // لكل مزوّد في 10 دقائق
  request: { limit: 10, windowMs: 60 * 60_000 }, // لكل مستخدم في الساعة
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function takeRateLimit(name: RateLimitName, subject: string, now = Date.now()) {
  const { windowMs } = RATE_LIMITS[name];
  // مضاعف للبيئات الآلية فقط (اختبارات e2e من عنوان واحد)؛ لا يُضبط في الإنتاج
  const limit =
    RATE_LIMITS[name].limit * Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1);
  const key = `${name}:${subject}`;
  const list = (events.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    events.set(key, list);
    return false;
  }
  list.push(now);
  events.set(key, list);
  return true;
}

/** عنوان العميل من ترويسات الوكيل (Railway/Vercel) */
export function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
  );
}

export const RATE_LIMIT_MESSAGE = "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.";
