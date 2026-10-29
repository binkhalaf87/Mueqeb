import { expect, test, type Page } from "@playwright/test";
import { SEED_PASSWORD, logIn, signUp, uniqueCr, uniqueEmail, uniquePhone } from "./helpers";

async function loginWith(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("الجوال أو البريد الإلكتروني").fill(identifier);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

async function newEstablishment(page: Page, identifier: string) {
  await signUp(page, identifier, "مدير المنشأة");
  await page.getByText("أطلب خدمة").click();
  await page.getByText("منشأة", { exact: true }).click();
  await page.getByLabel("اسم المنشأة").fill("مؤسسة الحساب");
  await page.getByLabel("رقم السجل التجاري").fill(uniqueCr());
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page).toHaveURL(/\/dashboard\/requester$/);
}

test("المنشأة تعدّل اسمها ونبذتها وبياناتها الشخصية من «حسابي»", async ({ page }) => {
  await newEstablishment(page, uniqueEmail());
  await page.getByRole("link", { name: "حسابي" }).click();
  await expect(page).toHaveURL(/\/dashboard\/account$/);

  await page.getByLabel("الاسم الكامل").fill("خالد المحدَّث");
  await page.getByLabel("المدينة").selectOption("جدة");
  await page.getByRole("button", { name: "حفظ البيانات" }).click();
  await expect(page.getByText("حُفظت بياناتك.")).toBeVisible();

  const establishment = page.getByTestId("account-establishment");
  await establishment.getByLabel("اسم المنشأة").fill("مؤسسة الحساب المحدّثة");
  await establishment.getByLabel("نبذة عن المنشأة").fill("مقاولات عامة، 25 موظفاً.");
  await establishment.getByRole("button", { name: "حفظ بيانات المنشأة" }).click();
  await expect(page.getByText("حُفظت بيانات المنشأة.")).toBeVisible();

  // نبذة تطلب بيانات دخول حكومية تُرفض
  await establishment.getByLabel("نبذة عن المنشأة").fill("أرسلوا رمز التحقق الخاص بأبشر");
  await establishment.getByRole("button", { name: "حفظ بيانات المنشأة" }).click();
  await expect(establishment.getByText(/كلمات مرور أو رموز تحقق/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("الاسم الكامل")).toHaveValue("خالد المحدَّث");
  await expect(establishment.getByLabel("نبذة عن المنشأة")).toHaveValue("مقاولات عامة، 25 موظفاً.");
  await expect(page.getByTestId("current-user")).toContainText("خالد المحدَّث");
  await page.goto("/dashboard/requester");
  await expect(page.getByTestId("requester-account")).toContainText("مؤسسة الحساب المحدّثة");
});

test("تغيير كلمة المرور يتطلب الحالية ويُخرج الجلسات الأخرى", async ({ page, browser }) => {
  const email = uniqueEmail();
  await newEstablishment(page, email);

  // جلسة ثانية على «جهاز آخر»
  const other = await (await browser.newContext()).newPage();
  await logIn(other, email);
  await expect(other).toHaveURL(/\/dashboard\/requester/);

  await page.goto("/dashboard/account");
  const form = page.getByTestId("account-password");
  await form.getByLabel("كلمة المرور الحالية").fill("wrong-password");
  await form.getByLabel("كلمة المرور الجديدة", { exact: true }).fill("NewPass#2026");
  await form.getByLabel("تأكيد كلمة المرور الجديدة").fill("NewPass#2026");
  await form.getByRole("button", { name: "تغيير كلمة المرور" }).click();
  await expect(form.getByText("كلمة المرور الحالية غير صحيحة.")).toBeVisible();

  await form.getByLabel("كلمة المرور الحالية").fill(SEED_PASSWORD);
  await form.getByLabel("كلمة المرور الجديدة", { exact: true }).fill("NewPass#2026");
  await form.getByLabel("تأكيد كلمة المرور الجديدة").fill("NewPass#2026");
  await form.getByRole("button", { name: "تغيير كلمة المرور" }).click();
  await expect(form.getByText(/تغيّرت كلمة المرور/)).toBeVisible();

  // هذا الجهاز ما زال داخلاً، والجهاز الآخر خرج
  await page.goto("/dashboard/requester");
  await expect(page).toHaveURL(/\/dashboard\/requester$/);
  await other.goto("/dashboard/requester");
  await expect(other).toHaveURL(/\/login/);

  // كلمة المرور القديمة لا تعمل، والجديدة تعمل
  await loginWith(other, email, SEED_PASSWORD);
  await expect(other.getByText("بيانات الدخول غير صحيحة.")).toBeVisible();
  await loginWith(other, email, "NewPass#2026");
  await expect(other).toHaveURL(/\/dashboard\/requester/);
});

test("حساب مسجّل بالجوال يضيف بريداً ويدخل به", async ({ page }) => {
  await newEstablishment(page, uniquePhone());
  const email = uniqueEmail();
  await page.goto("/dashboard/account");
  const login = page.getByTestId("account-login");
  await login.getByLabel("أضف بريداً للدخول").fill(email);
  await login.getByLabel("كلمة المرور الحالية").fill(SEED_PASSWORD);
  await login.getByRole("button", { name: "إضافة البريد" }).click();
  await expect(page.getByText(/تغيّر بريد الدخول/)).toBeVisible();
  await expect(page.getByTestId("login-email")).toHaveText(email);

  // بريد مستخدم لحساب آخر يُرفض
  await login.getByLabel("البريد الجديد").fill("admin@mueqeb.test");
  await login.getByLabel("كلمة المرور الحالية").fill(SEED_PASSWORD);
  await login.getByRole("button", { name: "تغيير البريد" }).click();
  await expect(login.getByText("هذا البريد مستخدم لحساب آخر.")).toBeVisible();

  await page.getByRole("button", { name: "خروج" }).click();
  await logIn(page, email);
  await expect(page).toHaveURL(/\/dashboard\/requester/);
});

test("لوحة الشركة تلخّص الطلبات وتبرز ما يحتاج إجراءً", async ({ page }) => {
  await logIn(page, "establishment@mueqeb.test");
  const stats = page.getByTestId("requester-stats");
  await expect(stats).toContainText("تحتاج إجراءً منك");
  await expect(stats).toContainText("مكتملة");
  // الطلب العام في seed عليه عرض بانتظار الاختيار
  await page.getByRole("link", { name: /تحتاج إجراءً منك \(/ }).click();
  await expect(
    page.getByTestId("next-action").filter({ hasText: "قارن واختر" }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: /^مكتملة \(/ }).click();
  await expect(page.getByTestId("my-requests").getByText("مكتمل").first()).toBeVisible();
});

test("لوحة المزوّد تعرض طلباته الجارية ومستحقاته", async ({ page }) => {
  await logIn(page, "provider4@mueqeb.test");
  await expect(page.getByTestId("provider-order-stats")).toContainText("طلبات مكتملة");
  await expect(page.getByTestId("provider-active-orders")).toContainText("لا توجد طلبات جارية");
  const earnings = page.getByTestId("provider-earnings");
  await expect(earnings).toContainText("مستحق لك");
  await expect(earnings).toContainText("0 ر.س");
  // الملف مكتمل ومعتمد: لا تظهر خطوات الإكمال
  await expect(page.getByText("خطوات إكمال الملف")).toHaveCount(0);
});
