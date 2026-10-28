import { expect, test, type Page } from "@playwright/test";
import { logIn, signUp, uniqueCr, uniqueEmail } from "./helpers";

const pdf = (name: string) => ({
  name: `${name}.pdf`,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF`),
});

const DOCS = [
  ["commercial_register", "السجل التجاري"],
  ["municipal_license", "الرخصة البلدية"],
  ["manager_id", "هوية المسؤول"],
  ["iban_certificate", "شهادة الحساب البنكي (IBAN)"],
] as const;

/** ينشئ مزوّداً جديداً، يكمل ملفه ومستنداته وخدمة واحدة، ويرسله للتوثيق */
async function createSubmittedProvider(page: Page, officeName: string, city: string) {
  await signUp(page, uniqueEmail(), "مسؤول المكتب");
  await page.getByText("أقدّم خدمة").click();
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page).toHaveURL(/\/dashboard\/provider$/);

  await page.goto("/dashboard/provider/profile");
  await page.getByLabel("اسم المكتب").fill(officeName);
  await page.getByLabel("رقم السجل التجاري").fill(uniqueCr());
  await page.getByLabel("رقم الرخصة البلدية").fill("40011223");
  await page.getByLabel(city, { exact: true }).check();
  await page.getByRole("button", { name: "حفظ بيانات المكتب" }).click();
  await expect(page.getByText("حُفظ الملف.")).toBeVisible();

  for (const [type, label] of DOCS) {
    const row = page.getByTestId(`doc-${type}`);
    await row.getByLabel(`ملف ${label}`).setInputFiles(pdf(type));
    await row.getByRole("button", { name: "رفع" }).click();
    await expect(row.getByText(`${type}.pdf`)).toBeVisible();
  }

  await page.goto("/dashboard/provider/services");
  await page.getByLabel("الخدمة").selectOption({ label: "إصدار أو تجديد رخصة عمل" });
  await expect(page.getByTestId("fee-guide")).toContainText("100 ر.س");
  await page.getByLabel("الأتعاب «يبدأ من» (ريال)").fill("50");
  await page.getByLabel("المدة المتوقعة (أيام)").fill("3");
  await page.getByRole("button", { name: "إضافة الخدمة" }).click();
  await expect(page.getByText("الحد الأدنى لأتعاب هذه الخدمة 100 ر.س")).toBeVisible();
  // القيم تبقى بعد خطأ التحقق
  await expect(page.getByLabel("المدة المتوقعة (أيام)")).toHaveValue("3");
  await page.getByLabel("الأتعاب «يبدأ من» (ريال)").fill("175.5");
  await page.getByRole("button", { name: "إضافة الخدمة" }).click();
  await expect(page.getByTestId("my-services")).toContainText("175.50 ر.س");

  await page.goto("/dashboard/provider/profile");
  await page.getByRole("button", { name: "إرسال للتوثيق" }).click();
  await expect(page.getByTestId("provider-stage")).toContainText("قيد المراجعة");
  await expect(page.getByLabel("اسم المكتب")).toHaveAttribute("readonly", "");
}

// تدفقات طويلة (تسجيل + رفع 4 مستندات + مراجعة)
test.describe.configure({ timeout: 120_000 });

async function adminOpenProvider(page: Page, officeName: string) {
  await logIn(page, "admin@mueqeb.test");
  await page.goto("/admin/providers?stage=under_review");
  await page.getByRole("link", { name: new RegExp(officeName) }).click();
  await expect(page).toHaveURL(/\/admin\/providers\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("مزوّد غير معتمد مخفي، ويظهر بعد الاعتماد ويختفي بعد الإيقاف", async ({ browser }) => {
  const officeName = `مكتب الاعتماد ${Date.now()}`;
  const providerPage = await (await browser.newContext()).newPage();
  await createSubmittedProvider(providerPage, officeName, "تبوك");

  const adminPage = await (await browser.newContext()).newPage();
  const providerId = await adminOpenProvider(adminPage, officeName);

  // قبل الاعتماد: لا يظهر في التصفح ولا يمكن فتح صفحته
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/providers?city=تبوك");
  await expect(visitor.getByText(officeName)).toHaveCount(0);
  const before = await visitor.goto(`/providers/${providerId}`);
  expect(before?.status()).toBe(404);
  await expect(visitor.getByText("الصفحة غير موجودة")).toBeVisible();

  // المستندات تُفتح للإدارة عبر روابط موقعة
  const links = adminPage.getByTestId("admin-documents").getByRole("link");
  await expect(links).toHaveCount(4);
  const href = await links.first().getAttribute("href");
  expect(href).toContain("token=");
  expect((await adminPage.request.get(href!)).status()).toBe(200);

  await adminPage.getByRole("button", { name: "اعتماد" }).click();
  await expect(adminPage.getByText("اعتُمد المزوّد.")).toBeVisible();

  // بعد الاعتماد: يظهر في التصفح بالفلترة وصفحته العامة متاحة
  await visitor.goto("/providers?city=تبوك");
  await expect(visitor.getByTestId("providers-list")).toContainText(officeName);
  await visitor.goto("/providers?city=نجران");
  await expect(visitor.getByText(officeName)).toHaveCount(0);

  await visitor.goto(`/providers/${providerId}`);
  await expect(visitor.getByRole("heading", { name: officeName })).toBeVisible();
  await expect(visitor.getByText("مكتب مرخّص موثّق")).toBeVisible();
  await expect(visitor.getByTestId("provider-services")).toContainText("إصدار أو تجديد رخصة عمل");
  await expect(visitor.getByTestId("provider-services")).toContainText("175.50 ر.س");
  await expect(visitor.getByTestId("provider-services")).toContainText("3 يوم");
  await expect(visitor.getByTestId("provider-stats")).toContainText("قريباً");

  // الإيقاف يخفيه مجدداً
  await adminPage.getByLabel("سبب الإيقاف").fill("مراجعة شكوى");
  await adminPage.getByRole("button", { name: "إيقاف" }).click();
  await expect(adminPage.getByText("أُوقف المزوّد.")).toBeVisible();
  expect((await visitor.goto(`/providers/${providerId}`))?.status()).toBe(404);
});

test("الرفض يتطلب سبباً ويظهر السبب للمزوّد", async ({ browser }) => {
  const officeName = `مكتب الرفض ${Date.now()}`;
  const providerPage = await (await browser.newContext()).newPage();
  await createSubmittedProvider(providerPage, officeName, "أبها");

  const adminPage = await (await browser.newContext()).newPage();
  await adminOpenProvider(adminPage, officeName);
  await adminPage.getByRole("button", { name: "رفض" }).click();
  await expect(adminPage.getByText("اكتب السبب")).toBeVisible();
  await adminPage.getByLabel("سبب الرفض (مطلوب عند الرفض)").fill("الرخصة البلدية منتهية");
  await adminPage.getByRole("button", { name: "رفض" }).click();
  await expect(adminPage.getByText("رُفض الطلب.")).toBeVisible();

  await providerPage.goto("/dashboard/provider");
  await expect(providerPage.getByTestId("provider-stage")).toContainText("مرفوض");
  await expect(providerPage.getByTestId("rejection-reason")).toContainText("الرخصة البلدية منتهية");
  // بعد الرفض يعود الملف قابلاً للتعديل
  await providerPage.goto("/dashboard/provider/profile");
  await expect(providerPage.getByLabel("اسم المكتب")).not.toHaveAttribute("readonly", "");
});

test("المزوّد قيد المراجعة (seed) مخفي عن التصفح، والمعتمد ظاهر", async ({ page }) => {
  await page.goto("/providers");
  await expect(page.getByTestId("providers-list")).toContainText("مكتب الإنجاز للخدمات العامة");
  await expect(page.getByText("مكتب السرعة للتعقيب")).toHaveCount(0);

  await page.goto("/providers?city=جدة");
  await expect(page.getByText("مكتب الإنجاز للخدمات العامة")).toHaveCount(0);
});

test("صفحات المزوّد والإدارة محمية بالدور", async ({ page }) => {
  await logIn(page, "establishment@mueqeb.test");
  await expect(page).toHaveURL(/\/dashboard\/requester$/);
  for (const path of [
    "/dashboard/provider/profile",
    "/dashboard/provider/services",
    "/admin/providers",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\/requester$/);
  }
});
