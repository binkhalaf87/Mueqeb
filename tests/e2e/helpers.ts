import { readFileSync } from "node:fs";
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
  // انتظر اكتمال الدخول (إعادة التوجيه خارج صفحة الدخول) قبل أي تنقل لاحق
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** يتحقق أن زيارة المسار تعيد التوجيه إلى المسار المتوقع */
export async function expectRedirect(page: Page, from: string, to: string) {
  await page.goto(from);
  await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, "\\/")}(\\?.*)?$`));
}

/** آخر رابط أُرسل بالبريد لعنوان ما (من ملف EMAIL_LOG_FILE في بيئة الاختبار)، كمسار نسبي */
export async function emailLink(to: string, kind: "email_verify" | "password_reset") {
  let link: string | undefined;
  await expect
    .poll(
      () => {
        let content = "";
        try {
          content = readFileSync(process.env.EMAIL_LOG_FILE ?? "", "utf8");
        } catch {
          return undefined;
        }
        const entries = content
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { to: string; kind: string; url: string })
          .filter((e) => e.to === to && e.kind === kind);
        const url = entries.at(-1)?.url;
        link = url ? new URL(url).pathname + new URL(url).search : undefined;
        return link;
      },
      { message: `no ${kind} email for ${to}` },
    )
    .toBeTruthy();
  return link!;
}

/** يفتح رابط تأكيد البريد المرسل عند التسجيل */
export async function verifyEmail(page: Page, email: string) {
  await page.goto(await emailLink(email, "email_verify"));
  await expect(page.getByTestId("verify-email-banner")).toHaveCount(0);
}
