import { expect, test } from "@playwright/test";
import { expectRedirect, logIn, signUp, uniqueCr, uniqueEmail, uniquePhone } from "./helpers";

test.describe("التسجيل لكل دور", () => {
  test("طالب خدمة فرد بالبريد الإلكتروني", async ({ page }) => {
    await signUp(page, uniqueEmail(), "نورة القحطاني");
    await page.getByText("أطلب خدمة").click();
    await page.getByText("فرد", { exact: true }).click();
    await page.getByRole("button", { name: "متابعة" }).click();

    await expect(page).toHaveURL(/\/dashboard\/requester$/);
    await expect(page.getByTestId("requester-account")).toContainText("حساب فردي");
    await expect(page.getByTestId("current-user")).toContainText("طالب خدمة");

    await expectRedirect(page, "/dashboard/provider", "/dashboard/requester");
    await expectRedirect(page, "/admin", "/dashboard/requester");
    await expectRedirect(page, "/onboarding", "/dashboard/requester");
    await expectRedirect(page, "/login", "/dashboard/requester");
  });

  test("طالب خدمة منشأة بالجوال", async ({ page }) => {
    const cr = uniqueCr();
    await signUp(page, uniquePhone(), "فهد الدوسري");
    await page.getByText("أطلب خدمة").click();
    await page.getByText("منشأة", { exact: true }).click();
    await page.getByLabel("اسم المنشأة").fill("مؤسسة الأفق التجارية");
    await page.getByLabel("رقم السجل التجاري").fill(cr);
    await page.getByRole("button", { name: "متابعة" }).click();

    await expect(page).toHaveURL(/\/dashboard\/requester$/);
    await expect(page.getByTestId("requester-account")).toContainText("مؤسسة الأفق التجارية");
    await expect(page.getByTestId("requester-account")).toContainText(cr);
  });

  test("رقم سجل تجاري غير صالح يُرفض مع إبقاء القيم", async ({ page }) => {
    await signUp(page, uniqueEmail());
    await page.getByText("أطلب خدمة").click();
    await page.getByText("منشأة", { exact: true }).click();
    await page.getByLabel("اسم المنشأة").fill("مؤسسة");
    await page.getByLabel("رقم السجل التجاري").fill("123");
    await page.getByRole("button", { name: "متابعة" }).click();

    await expect(page.getByText("رقم السجل التجاري 10 أرقام")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel("اسم المنشأة")).toHaveValue("مؤسسة");
  });

  test("مزوّد خدمة بالجوال", async ({ page }) => {
    await signUp(page, uniquePhone(), "مكتب الوفاء");
    await page.getByText("أقدّم خدمة").click();
    await page.getByRole("button", { name: "متابعة" }).click();

    await expect(page).toHaveURL(/\/dashboard\/provider$/);
    await expect(page.getByText("حسابك بانتظار التوثيق")).toBeVisible();

    await expectRedirect(page, "/dashboard/requester", "/dashboard/provider");
    await expectRedirect(page, "/admin", "/dashboard/provider");
  });

  test("مستخدم لم يختر دوره يُعاد لشاشة الاختيار", async ({ page }) => {
    await signUp(page, uniqueEmail());
    await expectRedirect(page, "/dashboard/requester", "/onboarding");
    await expectRedirect(page, "/dashboard/provider", "/onboarding");
    await expectRedirect(page, "/admin", "/onboarding");
  });
});

test.describe("حسابات seed", () => {
  test("الإدارة تصل للوحتها فقط", async ({ page }) => {
    await logIn(page, "admin@mueqeb.test");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("current-user")).toContainText("الإدارة");
    await expect(page.getByTestId("admin-user-counts")).toBeVisible();
    await expect(page.getByText("provider_commission_pct")).toBeVisible();

    await expectRedirect(page, "/dashboard/requester", "/admin");
    await expectRedirect(page, "/dashboard/provider", "/admin");
  });

  test("المزوّد يدخل بالجوال", async ({ page }) => {
    await logIn(page, "0500000002");
    await expect(page).toHaveURL(/\/dashboard\/provider$/);
  });

  test("الزائر يُحوّل لتسجيل الدخول ثم يعود للصفحة المطلوبة", async ({ page }) => {
    await expectRedirect(page, "/dashboard/requester", "/login");
    await expect(page).toHaveURL(/next=%2Fdashboard%2Frequester/);
    await page.getByLabel("الجوال أو البريد الإلكتروني").fill("establishment@mueqeb.test");
    await page.getByLabel("كلمة المرور").fill("Mueqeb#2026");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/dashboard\/requester$/);
    await expect(page.getByTestId("requester-account")).toContainText("مؤسسة البناء الحديث");
  });

  test("كلمة مرور خاطئة", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("الجوال أو البريد الإلكتروني").fill("admin@mueqeb.test");
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();
  });

  test("تسجيل الخروج", async ({ page }) => {
    await logIn(page, "provider1@mueqeb.test");
    await expect(page).toHaveURL(/\/dashboard\/provider$/);
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "دخول" })).toBeVisible();
    await expectRedirect(page, "/dashboard/provider", "/login");
  });

  test("الواجهة عربية من اليمين لليسار", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });
});
