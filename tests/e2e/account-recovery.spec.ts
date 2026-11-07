import { expect, test } from "@playwright/test";
import { emailLink, signUp, uniqueCr, uniqueEmail, uniquePhone, verifyEmail } from "./helpers";

const NEW_PASSWORD = "Recovered#2026x";

test("التسجيل بالبريد: لا نشر قبل تأكيد البريد، ورابط التأكيد يفعّل الحساب", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email, "منيرة السبيعي");
  await page.getByText("أطلب خدمة").click();
  await page.getByText("منشأة", { exact: true }).click();
  await page.getByLabel("اسم المنشأة").fill("مؤسسة التأكيد");
  await page.getByLabel("رقم السجل التجاري").fill(uniqueCr());
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page).toHaveURL(/\/dashboard\/requester$/);

  const banner = page.getByTestId("verify-email-banner");
  await expect(banner).toContainText(email);

  // الخادم يرفض النشر قبل التأكيد (لا يُعتمد على الواجهة)
  await page.goto("/dashboard/requester/requests/new");
  await page.getByLabel("الخدمة").selectOption({ label: "إصدار أو تجديد رخصة عمل" });
  await page.getByLabel("المدينة").selectOption("الرياض");
  await page.getByLabel("وصف الطلب").fill("طلب قبل تأكيد البريد");
  await page.getByRole("button", { name: "انشر الطلب" }).click();
  await expect(page.getByText(/أكّد بريدك الإلكتروني أولاً/)).toBeVisible();

  // إعادة الإرسال من الشريط
  await banner.getByRole("button", { name: "أعد إرسال الرابط" }).click();
  await expect(page.getByTestId("resend-result")).toContainText(email);

  await verifyEmail(page, email);
  await expect(page).toHaveURL(/\/dashboard\/account\?verified=1$/);
  await expect(page.getByTestId("email-status")).toHaveText("مؤكَّد");

  // الرابط لمرة واحدة
  await page.goto(await emailLink(email, "email_verify"));
  await expect(page.getByTestId("verify-invalid")).toBeVisible();
});

test("التسجيل بالجوال: الشريط يطلب إضافة بريد وتأكيده", async ({ page }) => {
  await signUp(page, uniquePhone(), "خالد الشمري");
  await page.getByText("أطلب خدمة").click();
  await page.getByText("فرد", { exact: true }).click();
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByTestId("verify-email-banner")).toContainText("أضف بريداً إلكترونياً");
});

test("استعادة كلمة المرور بالبريد: رابط لمرة واحدة، ويُخرج الجلسات القائمة", async ({
  browser,
}) => {
  const email = uniqueEmail();
  const original = await (await browser.newContext()).newPage();
  await signUp(original, email, "نايف العنزي");

  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("link", { name: "نسيت كلمة المرور؟" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  // الرد واحد لبريد غير مسجّل (لا يكشف الحسابات)
  await page.getByLabel("البريد الإلكتروني").fill(uniqueEmail());
  await page.getByRole("button", { name: "أرسل رابط الاستعادة" }).click();
  const generic = page.getByText(/إن كان هذا البريد مسجّلاً لدينا/);
  await expect(generic).toBeVisible();

  await page.goto("/forgot-password");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByRole("button", { name: "أرسل رابط الاستعادة" }).click();
  await expect(generic).toBeVisible();

  const link = await emailLink(email, "password_reset");
  await page.goto(link);
  await page.getByLabel("كلمة المرور الجديدة").fill(NEW_PASSWORD);
  await page.getByLabel("تأكيد كلمة المرور").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "احفظ كلمة المرور" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(page.getByText("تغيّرت كلمة المرور")).toBeVisible();

  // الدخول بكلمة المرور الجديدة
  await page.getByLabel("الجوال أو البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // الجلسة القديمة على الجهاز الآخر خرجت
  await original.goto("/onboarding");
  await expect(original).toHaveURL(/\/login/);

  // الرابط نفسه لا يُستخدم مرتين
  await page.goto(link);
  await expect(page.getByTestId("reset-invalid")).toBeVisible();
});

test("رابط استعادة مزيف أو مشوّه مرفوض", async ({ page }) => {
  await page.goto("/reset-password?token=fake");
  await expect(page.getByTestId("reset-invalid")).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByTestId("reset-invalid")).toBeVisible();
});
