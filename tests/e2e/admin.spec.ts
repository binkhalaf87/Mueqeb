import { expect, test, type Page } from "@playwright/test";
import { logIn, signUp, uniqueEmail, SEED_PASSWORD } from "./helpers";

test.describe.configure({ timeout: 120_000 });

const text = (page: Page, testId: string) => page.getByTestId(testId).innerText();

test("معيار القبول: كل رقم مالي في اللوحة يطابق أرصدة الدفتر", async ({ page }) => {
  await logIn(page, "admin@mueqeb.test");
  // اختبارات أخرى قد تضيف قيوداً بالتوازي؛ نقرأ الصفحتين حتى تتطابقا في اللحظة نفسها
  await expect
    .poll(
      async () => {
        await page.goto("/admin");
        const dashboard = [
          await text(page, "kpi-revenue"),
          await text(page, "kpi-escrow"),
          await text(page, "kpi-payables"),
          await text(page, "kpi-paid-out"),
        ];
        await page.goto("/admin/ledger");
        const ledger = [
          await text(page, "ledger-balance-platform_revenue"),
          await text(page, "ledger-balance-escrow"),
          await text(page, "ledger-balance-provider_payable"),
          await text(page, "ledger-balance-provider_paid"),
        ];
        return JSON.stringify(dashboard) === JSON.stringify(ledger);
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  await expect(page.getByTestId("ledger-imbalance")).toHaveText("متوازن ✓");
});

test("صرف المستحقات يُقيَّد في الدفتر ويُصدَّر CSV", async ({ page }) => {
  await logIn(page, "admin@mueqeb.test");
  await page.goto("/admin/payables");
  const row = page.getByTestId("payable-row").filter({ hasText: "مكتب الريادة للخدمات العامة" });
  await expect(row.getByTestId("payable-outstanding")).not.toHaveText("0 ر.س");
  const amount = await row.getByTestId("payable-outstanding").innerText();

  const csv = await page.request.get("/admin/payables/export?type=payables");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("مكتب الريادة للخدمات العامة");
  expect(body.split("\r\n")[0]).toContain("outstanding_sar");

  const ref = `TRX-${Date.now()}`;
  await row.getByPlaceholder("مرجع التحويل البنكي").fill(ref);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /تسجيل صرف/ }).click();
  await expect(page.getByTestId("payouts-list")).toContainText(ref);
  await expect(page.getByTestId("payouts-list")).toContainText(amount);
  await expect(
    page
      .getByTestId("payable-row")
      .filter({ hasText: "مكتب الريادة للخدمات العامة" })
      .getByTestId("payable-outstanding"),
  ).toHaveText("0 ر.س");

  await page.goto("/admin/ledger");
  await expect(page.getByText(`صرف للمزوّد — مرجع التحويل ${ref}`).first()).toBeVisible();
  await expect(page.getByTestId("ledger-imbalance")).toHaveText("متوازن ✓");

  const payouts = await (await page.request.get("/admin/payables/export?type=payouts")).text();
  expect(payouts).toContain(ref);
});

test("تصدير CSV للإدارة فقط", async ({ page }) => {
  await logIn(page, "provider1@mueqeb.test");
  const res = await page.request.get("/admin/payables/export?type=payables");
  expect(res.status()).toBe(403);
});

test("تغيير الإعدادات يُسجَّل بالقيمة القديمة والجديدة", async ({ page }) => {
  await logIn(page, "admin@mueqeb.test");
  await page.goto("/admin/settings");
  const field = page.getByLabel("كشف التقييمات بعد (يوم)");
  const original = await field.inputValue();
  const next = original === "7" ? "8" : "7";

  await field.fill(next);
  await page.getByRole("button", { name: "حفظ الإعدادات" }).click();
  await expect(page.getByText("حُفظت 1 إعدادات.")).toBeVisible();
  await page.reload();
  const entry = page
    .getByTestId("audit-log")
    .locator("tr")
    .filter({ hasText: "review_reveal_days" })
    .first();
  await expect(entry).toContainText("مدير المنصة");
  await expect(entry).toContainText(original);
  await expect(entry).toContainText(next);

  // إرجاع القيمة
  await page.getByLabel("كشف التقييمات بعد (يوم)").fill(original);
  await page.getByRole("button", { name: "حفظ الإعدادات" }).click();
  await expect(page.getByText("حُفظت 1 إعدادات.")).toBeVisible();
});

test("قيم الإعدادات خارج الحدود تُرفض", async ({ page }) => {
  await logIn(page, "admin@mueqeb.test");
  await page.goto("/admin/settings");
  await page.getByLabel("رسم الخدمة على العميل (%)").fill("80");
  await page.getByRole("button", { name: "حفظ الإعدادات" }).click();
  await expect(page.getByText("0–30")).toBeVisible();
});

test("إيقاف عميل يمنع دخوله ويعرض السبب", async ({ browser }) => {
  const email = uniqueEmail();
  const user = await (await browser.newContext()).newPage();
  await signUp(user, email, "عميل للإيقاف");
  await user.getByText("أطلب خدمة").click();
  await user.getByRole("button", { name: "متابعة" }).click();
  await expect(user).toHaveURL(/\/dashboard\/requester$/);

  const admin = await (await browser.newContext()).newPage();
  await logIn(admin, "admin@mueqeb.test");
  await admin.goto("/admin/users?q=عميل للإيقاف");
  const row = admin.getByTestId("user-row").filter({ hasText: "عميل للإيقاف" }).first();
  await row.getByPlaceholder("سبب الإيقاف").fill("نشاط مشبوه");
  admin.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "إيقاف" }).click();
  await expect(row).toContainText("موقوف");
  await expect(row).toContainText("نشاط مشبوه");

  // جلسة قائمة: تُحوَّل لصفحة الإيقاف
  await user.goto("/dashboard/requester");
  await expect(user.getByTestId("suspended")).toContainText("نشاط مشبوه");

  // دخول جديد: مرفوض
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("/login");
  await fresh.getByLabel("الجوال أو البريد الإلكتروني").fill(email);
  await fresh.getByLabel("كلمة المرور").fill(SEED_PASSWORD);
  await fresh.getByRole("button", { name: "دخول" }).click();
  await expect(fresh.getByText("هذا الحساب موقوف من الإدارة")).toBeVisible();

  // سجل التدقيق
  await admin.goto("/admin/settings");
  await expect(admin.getByTestId("audit-log")).toContainText("نشاط مشبوه");
});

test("إدارة أنواع الخدمات: إضافة خدمة ورفض نطاق غير صالح", async ({ page }) => {
  await logIn(page, "admin@mueqeb.test");
  await page.goto("/admin/services");
  const form = page.getByTestId("service-type-form").first();
  const slug = `e2e_${Date.now()}`;
  await form.getByLabel("المعرّف (لاتيني)").fill(slug);
  await form.getByLabel("الاسم").fill(`خدمة تجريبية ${slug.slice(-4)}`);
  await form.getByLabel("الحد الأدنى (ريال)").fill("100");
  await form.getByLabel("النطاق من (ريال)").fill("90");
  await form.getByLabel("النطاق إلى (ريال)").fill("200");
  await form.getByLabel("متاحة للعملاء والمزوّدين").uncheck();
  await form.getByRole("button", { name: "إضافة الخدمة" }).click();
  await expect(form.getByText("بداية النطاق الاسترشادي لا تقل عن الحد الأدنى")).toBeVisible();

  await form.getByLabel("النطاق من (ريال)").fill("120");
  await form.getByRole("button", { name: "إضافة الخدمة" }).click();
  await expect(form.getByText("أُضيفت الخدمة.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("service-type-row").filter({ hasText: `خدمة تجريبية ${slug.slice(-4)}` }),
  ).toContainText("موقوفة");
});

test("البلاغات تعرض المرفوض والمحجوب، ولغير الإدارة لا وصول", async ({ page }) => {
  await logIn(page, "admin@mueqeb.test");
  await page.goto("/admin/reports");
  await expect(page.getByRole("link", { name: /طلب كلمة مرور/ })).toBeVisible();
  await page.getByRole("link", { name: /مشاركة أرقام/ }).click();
  await expect(page).toHaveURL(/tab=masked/);

  const other = await page.context().browser()!.newContext();
  const provider = await other.newPage();
  await logIn(provider, "provider1@mueqeb.test");
  for (const path of [
    "/admin/reports",
    "/admin/payables",
    "/admin/settings",
    "/admin/users",
    "/admin/services",
  ]) {
    await provider.goto(path);
    await expect(provider).toHaveURL(/\/dashboard\/provider$/);
  }
});
