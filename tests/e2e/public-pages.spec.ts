import { expect, test } from "@playwright/test";

test("صفحة نوع الخدمة: المحتوى وschema.org وأزرار الطلب", async ({ page }) => {
  await page.goto("/services");
  await page
    .getByTestId("service-card")
    .filter({ hasText: "إصدار أو تجديد رخص العمل" })
    .getByRole("link", { name: /تفاصيل الخدمة/ })
    .click();
  await expect(page).toHaveURL(/\/services\/qiwa_work_permit$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("إصدار أو تجديد رخص العمل");
  await expect(page.getByTestId("service-platform")).toContainText("منصة قوى");
  // أقل سعر معلن فعلاً (قد تضيف اختبارات أخرى مكاتب بأسعار مختلفة بالتوازي)
  await expect(page.getByTestId("service-fee")).toContainText(
    /أسعار معلنة من المكاتب: من [\d.]+ ر\.س/,
  );
  await expect(page.getByTestId("required-docs")).toContainText("صورة إقامة العامل");
  await expect(page.getByText("هذه أمثلة وليست قائمة كاملة")).toBeVisible();
  await expect(page.getByTestId("typical-duration")).toContainText("أيام");
  await expect(page.getByTestId("top-providers")).toContainText("مكتب الإنجاز للخدمات العامة");
  await expect(page).toHaveTitle("إصدار أو تجديد رخص العمل | خدمات التعقيب عبر مُعقّب");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/services\/qiwa_work_permit$/,
  );
  // لا تفويض معمّم «بعد الدفع» ولا نطاقات سعرية تقديرية
  await expect(page.locator("main")).not.toContainText("بعد الدفع");
  await expect(page.locator("main")).not.toContainText("300 ر.س");

  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "[]",
  );
  expect(ld[0]["@type"]).toBe("Service");
  // السعر في البيانات المنظمة من الأسعار المعلنة فعلاً
  expect(ld[0].offers).toMatchObject({ priceCurrency: "SAR" });
  expect(ld[0].offers.lowPrice).toMatch(/^\d+\.\d{2}$/);

  // «اطلب عرض سعر» يقود الزائر للدخول ثم نموذج الطلب
  await page.getByTestId("request-now").click();
  await expect(page).toHaveURL(/\/login/);
});

test("خدمة بلا مكاتب: لا زر طلب، ورسالة واضحة", async ({ page }) => {
  await page.goto("/services/cr_confirm");
  await expect(page.getByTestId("no-providers-for-service")).toHaveText(
    "لا توجد مكاتب متاحة لهذه الخدمة حاليًا.",
  );
  await expect(page.getByTestId("request-now")).toHaveCount(0);
  await expect(page.getByTestId("service-fee")).toContainText("تُحدد في عرض السعر");
  await expect(page.getByTestId("typical-duration")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("—");
  await page.getByRole("link", { name: "تصفّح خدمات أخرى" }).click();
  await expect(page).toHaveURL(/\/services$/);
});

test("البحث في الخدمات يدعم المرادفات الشائعة", async ({ page }) => {
  await page.goto("/services");
  await page.getByLabel("ابحث عن خدمة").fill("نقل كفالة");
  await page.getByRole("button", { name: "بحث" }).click();
  await expect(page).toHaveURL(/\/services\?q=/);
  await expect(page.getByTestId("service-card")).toHaveCount(1);
  await expect(page.getByTestId("service-card")).toContainText("نقل خدمات موظف");

  await page.goto("/services?q=" + encodeURIComponent("خدمة غير موجودة إطلاقاً"));
  await expect(page.getByTestId("no-services")).toBeVisible();
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
] as const) {
  test(`${title}: مسودة معلّمة بوضوح`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(page.getByTestId("legal-draft-notice")).toContainText("مراجعة قانونية");
  });
}

test("الصفحة الرئيسية: تبدأ بالمعاملات، والزر الرئيسي يفتح الخدمات لا التسجيل", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ابحث عن مكتب تعقيب لمعاملات منشأتك",
  );
  await expect(page.getByTestId("home-categories")).toContainText("نقل خدمات الموظفين");
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toContainText(
    "مكاتب التعقيب",
  );
  await expect(page.getByText("أموالك محفوظة")).toHaveCount(0);

  // كل مجموعة تقود لقسمها في دليل الخدمات
  await page
    .getByTestId("home-categories")
    .getByRole("link", { name: /عرض خدمات بلدي/ })
    .click();
  await expect(page).toHaveURL(/\/services#balady$/);
  await expect(page.getByTestId("category-balady")).toBeVisible();

  await page.goto("/");
  await page.getByTestId("home-browse-services").click();
  await expect(page).toHaveURL(/\/services$/);
});

test("صفحة المكتب تبرز الترخيص والتقييم", async ({ page }) => {
  await page.goto("/providers");
  await page
    .getByRole("link", { name: /مكتب الإنجاز للخدمات العامة/ })
    .first()
    .click();
  await expect(page.getByTestId("provider-license")).toContainText("تم التحقق من بيانات المكتب");
});

test("سياسة الاسترداد مخفية: لا رابط لها ولا تُفتح", async ({ page, request }) => {
  await page.goto("/terms");
  await expect(page.getByRole("link", { name: /الاسترداد/ })).toHaveCount(0);
  await expect(page.getByText("المسؤولية والقانون الواجب التطبيق")).toHaveCount(0);
  expect((await request.get("/refund-policy")).status()).toBe(404);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("refund-policy");
});

test("الصفحات العامة خالية من الادعاءات الممنوعة، والعنوان والوصف محدّثان", async ({ page }) => {
  for (const path of ["/", "/services", "/providers", "/services/qiwa_transfer_service"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    for (const banned of [
      "الأفضل",
      "الأسرع",
      "معتمد حكومي",
      "إنجاز فوري",
      "أقل سعر",
      "أمان كامل",
      "مرخّص",
      "موثّق",
      "عروض مغلقة",
      "المزوّد",
    ]) {
      expect(text, `${path} contains ${banned}`).not.toContain(banned);
    }
  }
  await page.goto("/");
  await expect(page).toHaveTitle("مُعقّب | خدمات التعقيب ومكاتب الخدمات العامة للمنشآت");
  await expect(page.locator("footer")).toContainText("منصة خاصة وليست جهة حكومية");
});

test("«انضم كمكتب تعقيب» يصل إلى اختيار «أقدّم خدمة» مباشرة", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "انضم كمكتب تعقيب" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("انضم كمكتب تعقيب");
  await page.getByLabel("الاسم الكامل").fill("مكتب التجربة");
  await page.getByLabel("الجوال أو البريد الإلكتروني").fill(`join-${Date.now()}@mueqeb.test`);
  await page.getByLabel("كلمة المرور").fill("Mueqeb#2026");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/onboarding\?as=provider$/);
  await expect(page.getByRole("radio", { name: /أقدّم خدمة/ })).toBeChecked();
});

test("مكاتب: الحالة الخالية مع الفلاتر تختلف عن بدونها", async ({ page }) => {
  await page.goto("/providers?city=" + encodeURIComponent("نجران"));
  await expect(page.getByTestId("no-providers")).toHaveText(
    "لا توجد مكاتب تطابق خياراتك حاليًا. جرّب تغيير الخدمة أو المدينة.",
  );
});
