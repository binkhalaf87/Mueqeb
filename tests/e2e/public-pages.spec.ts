import { expect, test } from "@playwright/test";

test("صفحة نوع الخدمة: المحتوى وschema.org وزر «اطلب الآن»", async ({ page }) => {
  await page.goto("/services");
  await page
    .getByRole("link", { name: /إصدار أو تجديد رخصة عمل/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/services\/qiwa_work_permit$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("إصدار أو تجديد رخصة عمل");
  await expect(page.getByTestId("guide-range")).toContainText("150 ر.س – 300 ر.س");
  await expect(page.getByTestId("required-docs")).toContainText("صورة إقامة العامل");
  await expect(page.getByTestId("typical-duration")).toContainText("أيام");
  await expect(page.getByTestId("top-providers")).toContainText("مكتب الإنجاز للخدمات العامة");
  await expect(page).toHaveTitle(/إصدار أو تجديد رخصة عمل/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/services\/qiwa_work_permit$/,
  );

  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "[]",
  );
  expect(ld[0]["@type"]).toBe("Service");
  expect(ld[0].offers).toMatchObject({ priceCurrency: "SAR", lowPrice: "150.00" });

  // «اطلب الآن» يقود الزائر للدخول ثم نموذج الطلب
  await page.getByTestId("request-now").click();
  await expect(page).toHaveURL(/\/login/);
});

test("خدمة غير موجودة → 404", async ({ page }) => {
  const res = await page.goto("/services/no_such_service");
  expect(res?.status()).toBe(404);
});

test("sitemap وrobots", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/services/qiwa_work_permit");
  expect(sitemap).toContain("/terms");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
  expect(robots).toMatch(/Disallow: \/dashboard/);
});

for (const [path, title] of [
  ["/terms", "الشروط والأحكام"],
  ["/privacy", "سياسة الخصوصية"],
  ["/refund-policy", "سياسة الاسترداد والنزاعات"],
] as const) {
  test(`${title}: مسودة معلّمة بوضوح`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(page.getByTestId("legal-draft-notice")).toContainText("مراجعة قانونية");
  });
}
