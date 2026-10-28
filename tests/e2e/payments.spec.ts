import { expect, test, type Browser, type Page } from "@playwright/test";
import { logIn } from "./helpers";

test.describe.configure({ timeout: 120_000 });

const tag = () => Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");

async function as(browser: Browser, identifier: string) {
  const page = await (await browser.newContext()).newPage();
  await logIn(page, identifier);
  return page;
}

/** طلب مباشر بالسعر المعلن (180 ر.س من مكتب الإنجاز) → صفحة الطلب بانتظار الدفع */
async function directListedOrder(page: Page) {
  await page.goto("/providers");
  await page.getByRole("link", { name: /مكتب الإنجاز للخدمات العامة/ }).click();
  await page
    .getByTestId("provider-services")
    .locator("li")
    .filter({ hasText: "إصدار أو تجديد رخصة عمل" })
    .getByRole("link", { name: "اطلب بالسعر المعلن" })
    .click();
  await page.getByLabel("المدينة").selectOption("الرياض");
  await page.getByRole("button", { name: "أرسل الطلب بالسعر المعلن" }).click();
  await expect(page.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");
  return page.url();
}

async function payWithCard(page: Page, card: string) {
  await page.getByRole("link", { name: /ادفع الآن/ }).click();
  await page.getByRole("button", { name: /ادفع .* بالبطاقة/ }).click();
  await expect(page).toHaveURL(/\/payments\/test-checkout\//);
  await page.getByLabel("رقم البطاقة").fill(card);
  await page.getByRole("button", { name: "ادفع", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/requester\/requests\/[0-9a-f-]{36}\?payment=return$/);
}

test("معيار القبول: الدفع ببطاقة اختبار، قيود متوازنة في الدفتر", async ({ browser }) => {
  const requester = await as(browser, "0500000003");
  await directListedOrder(requester);

  // شاشة الدفع: أتعاب + رسم خدمة = الإجمالي، وسطر الرسوم الحكومية منفصل
  await requester.getByRole("link", { name: /ادفع الآن — 189 ر.س/ }).click();
  const summary = requester.getByTestId("payment-summary");
  await expect(summary.getByTestId("fee")).toHaveText("180 ر.س");
  await expect(summary.getByTestId("client-fee")).toHaveText("+ 9 ر.س");
  await expect(summary.getByTestId("total")).toHaveText("189 ر.س");
  await expect(summary.getByTestId("gov-fees")).toContainText(
    "رسوم حكومية متوقعة تدفعها أنت مباشرة عبر القناة الرسمية",
  );

  await requester.getByRole("button", { name: "ادفع 189 ر.س بالبطاقة" }).click();
  await expect(requester.getByTestId("checkout-amount")).toHaveText("189 ر.س");
  await requester.getByLabel("رقم البطاقة").fill("4111 1111 1111 1111");
  await requester.getByRole("button", { name: "ادفع", exact: true }).click();

  await expect(requester.getByTestId("request-status")).toHaveText("بانتظار التفويض والمستندات");
  await expect(requester.getByTestId("payment-status")).toContainText("دفعت 189 ر.س");
  await expect(requester.getByTestId("order-events")).toContainText("مدفوع");

  // الإدارة: القيود متوازنة
  const admin = await as(browser, "admin@mueqeb.test");
  await admin.goto("/admin/ledger");
  await expect(admin.getByTestId("ledger-imbalance")).toHaveText("متوازن ✓");
  const order = admin.getByTestId("ledger-order").filter({ hasText: "189 ر.س" }).first();
  await expect(order).toContainText("متوازن");
  await expect(order).toContainText("دفع العميل: محفوظ في الضمان");
});

test("بطاقة مرفوضة لا تغيّر شيئاً ويمكن إعادة المحاولة", async ({ browser }) => {
  const requester = await as(browser, "0500000003");
  await directListedOrder(requester);

  await payWithCard(requester, "4000000000000002");
  await expect(requester.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");
  await expect(requester.getByTestId("payment-failed")).toBeVisible();

  await payWithCard(requester, "4111111111111111");
  await expect(requester.getByTestId("request-status")).toHaveText("بانتظار التفويض والمستندات");
});

test("الإلغاء قبل بدء التنفيذ: استرداد كامل وقيد عكسي", async ({ browser }) => {
  const requester = await as(browser, "0500000003");
  await directListedOrder(requester);
  await payWithCard(requester, "4111111111111111");
  await expect(requester.getByTestId("request-status")).toHaveText("بانتظار التفويض والمستندات");

  requester.once("dialog", (d) => d.accept());
  await requester.getByRole("button", { name: "إلغاء الطلب واسترداد المبلغ" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("ملغي");
  await expect(requester.getByTestId("payment-status")).toContainText("أُعيد إليك المبلغ كاملاً");

  const admin = await as(browser, "admin@mueqeb.test");
  await admin.goto("/admin/ledger");
  await expect(admin.getByTestId("ledger-imbalance")).toHaveText("متوازن ✓");
  await expect(admin.getByText("استرداد كامل للعميل (قيد عكسي)").first()).toBeVisible();
});

test("الرسوم الحكومية من العرض تظهر منفصلة، والتقريب بالهللة", async ({ browser }) => {
  const description = `تسجيل منشأة جديدة في التأمينات ${tag()}`;
  const requester = await as(browser, "establishment@mueqeb.test");
  await requester.goto("/dashboard/requester/requests/new");
  await requester.getByLabel("الخدمة").selectOption({ label: "إصدار أو تجديد رخصة عمل" });
  await requester.getByLabel("المدينة").selectOption("الرياض");
  await requester.getByLabel("وصف الطلب").fill(description);
  await requester.getByRole("button", { name: "انشر الطلب" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("مفتوح");

  const provider = await as(browser, "provider3@mueqeb.test");
  await provider.goto("/dashboard/provider/requests");
  await provider.getByRole("link", { name: new RegExp(description) }).click();
  await provider.getByLabel("أتعابك (ريال)").fill("190.10");
  await provider.getByLabel("الرسوم الحكومية المتوقعة (ريال)").fill("50");
  await provider.getByLabel("المدة (أيام)").fill("2");
  await provider.getByLabel("ما يشمله العرض").fill("إصدار الرخصة كاملة");
  await provider.getByRole("button", { name: "قدّم العرض" }).click();
  await expect(provider.getByText("حُفظ عرضك.")).toBeVisible();

  await requester.reload();
  requester.once("dialog", (d) => d.accept());
  await requester.getByRole("button", { name: "اختيار هذا العرض" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");

  // 190.10 × 5% = 9.505 → 9.51 (نصف هللة يُقرّب للأعلى)
  await requester.getByRole("link", { name: /ادفع الآن/ }).click();
  await expect(requester.getByTestId("fee")).toHaveText("190.10 ر.س");
  await expect(requester.getByTestId("client-fee")).toHaveText("+ 9.51 ر.س");
  await expect(requester.getByTestId("total")).toHaveText("199.61 ر.س");
  await expect(requester.getByTestId("gov-fees")).toContainText("50 ر.س");

  // المزوّد يرى صافي مستحقه: 190.10 − 15% (28.515 → 28.52) = 161.58
  await provider.reload();
  await expect(provider.getByTestId("provider-order")).toContainText("161.58 ر.س");
});

test("webhook يرفض التوقيع غير الصحيح", async ({ request }) => {
  const body = JSON.stringify({
    id: "evt_forged",
    type: "payment_paid",
    data: { id: "mock_pay_x", status: "paid", amount: 1, currency: "SAR" },
  });
  const unsigned = await request.post("/api/payments/webhook", {
    data: body,
    headers: { "content-type": "application/json" },
  });
  expect(unsigned.status()).toBe(401);

  const forged = await request.post("/api/payments/webhook", {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-mock-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"ab".repeat(32)}`,
    },
  });
  expect(forged.status()).toBe(401);
});

test("مسار العودة من البوابة يعيد العميل لصفحة الطلب", async ({ request }) => {
  const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const ok = await request.get(`/api/payments/return?request=${id}&id=pay_x&status=paid`, {
    maxRedirects: 0,
  });
  expect(ok.status()).toBe(307);
  expect(ok.headers().location).toMatch(
    new RegExp(`/dashboard/requester/requests/${id}\\?payment=return$`),
  );

  const bad = await request.get("/api/payments/return?request=../../admin", { maxRedirects: 0 });
  expect(bad.headers().location).toMatch(/\/dashboard\/requester$/);
});
