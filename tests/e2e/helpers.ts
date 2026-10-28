import { expect, type Page } from "@playwright/test";

export const SEED_PASSWORD = "Mueqeb#2026";

export function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mueqeb.test`;
}

export function uniquePhone() {
  return `05${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

export function uniqueCr() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

export async function signUp(page: Page, identifier: string, fullName = "مستخدم تجريبي") {
  await page.goto("/signup");
  await page.getByLabel("الاسم الكامل").fill(fullName);
  await page.getByLabel("الجوال أو البريد الإلكتروني").fill(identifier);
  await page.getByLabel("كلمة المرور").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

export async function logIn(page: Page, identifier: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("الجوال أو البريد الإلكتروني").fill(identifier);
  await page.getByLabel("كلمة المرور").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
}

/** يتحقق أن زيارة المسار تعيد التوجيه إلى المسار المتوقع */
export async function expectRedirect(page: Page, from: string, to: string) {
  await page.goto(from);
  await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, "\\/")}(\\?.*)?$`));
}
