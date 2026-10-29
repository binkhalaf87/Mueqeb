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
