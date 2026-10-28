import { expect, test, type Page } from "@playwright/test";
import { accept, as, deliver, paidRequest } from "./flows";
import { logIn } from "./helpers";

test.describe.configure({ timeout: 180_000 });

async function pickScores(page: Page, scores: Record<string, number>) {
  for (const [label, value] of Object.entries(scores)) {
    await page
      .getByTestId("review-form")
      .getByLabel(`${label} ${value}`, { exact: true })
      .check({ force: true });
  }
}

test("معيار القبول: التقييم بعد الإكمال فقط، ويظهر بالقاعدة المزدوجة", async ({ browser }) => {
  const { requester, requestId } = await paidRequest(browser);
  // قبل الإكمال لا يوجد قسم تقييم
  await expect(requester.getByTestId("reviews-section")).toHaveCount(0);

  const provider = await deliver(browser, requester, requestId);
  await expect(requester.getByTestId("reviews-section")).toHaveCount(0);
  accept(requester);
  await requester.getByRole("button", { name: "تأكيد الإنجاز" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("مكتمل");

  // العميل يقيّم المكتب
  const comment = `خدمة مميزة ${Math.random().toString(36).slice(2, 7).replace(/\d/g, "x")}`;
  await pickScores(requester, { السرعة: 5, الدقة: 4, التواصل: 5 });
  await requester.getByTestId("review-form").getByLabel("تعليق (اختياري)").fill(comment);
  await requester.getByRole("button", { name: "إرسال التقييم" }).click();
  await expect(requester.getByTestId("my-review")).toContainText("السرعة 5 · الدقة 4 · التواصل 5");
  await expect(requester.getByTestId("review-pending")).toBeVisible();

  // مخفي عن المكتب والعامة حتى يقيّم المكتب
  await provider.reload();
  await expect(provider.getByTestId("their-review")).toHaveCount(0);
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/providers");
  await visitor.getByRole("link", { name: /مكتب الإنجاز للخدمات العامة/ }).click();
  await expect(visitor.getByText(comment)).toHaveCount(0);

  // المكتب يقيّم العميل → يظهران معاً
  await pickScores(provider, { "وضوح الطلب": 4, "سرعة تسليم المستندات": 5 });
  await provider.getByRole("button", { name: "إرسال التقييم" }).click();
  await expect(provider.getByTestId("their-review")).toContainText(comment);

  await requester.reload();
  await expect(requester.getByTestId("their-review")).toContainText(
    "وضوح الطلب 4 · سرعة تسليم المستندات 5",
  );
  await expect(requester.getByTestId("review-pending")).toHaveCount(0);

  await visitor.reload();
  await expect(visitor.getByTestId("provider-reviews")).toContainText(comment);
  await expect(visitor.getByTestId("provider-rating")).not.toContainText("لا تقييمات");

  // لا يمكن التقييم مرة أخرى (لا نموذج)
  await expect(requester.getByTestId("review-form")).toHaveCount(0);
});

test("صفحة المكتب وبطاقة المقارنة تعرضان الإحصاءات، والتصفح مرتب بالمعادلة", async ({
  browser,
  page,
}) => {
  await page.goto("/providers");
  const cards = page.getByTestId("providers-list").locator("li");
  const names = await cards.allInnerTexts();
  const first = names.findIndex((t) => t.includes("مكتب الإنجاز للخدمات العامة"));
  const lower = names.findIndex((t) => t.includes("مكتب المسار للتعقيب"));
  // الإنجاز (منجزات وتقييمات) قبل المسار (بلا سجل)
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThan(lower);
  await expect(cards.nth(first)).toContainText("طلب منجز");

  await cards.nth(first).getByRole("link").click();
  const stats = page.getByTestId("provider-stats");
  await expect(stats).toContainText("التقييم");
  await expect(stats).toContainText("الالتزام بالموعد");
  await expect(stats).toContainText("متوسط وقت الرد");
  await expect(stats).toContainText("نسبة النزاعات");
  await expect(page.getByTestId("rating-breakdown")).toContainText("السرعة");

  // بطاقة المقارنة: طلب seed العام من المنشأة عليه عرض من مكتب الإنجاز
  const requester = await as(browser, "establishment@mueqeb.test");
  await requester.goto("/dashboard/requester");
  // طلب seed هو أقدم طلب مفتوح (القائمة مرتبة من الأحدث، واختبارات أخرى تنشئ طلبات بالتوازي)
  await requester.getByTestId("my-requests").getByRole("link", { name: /مفتوح/ }).last().click();
  const row = requester.getByTestId("bid-row").filter({ hasText: "مكتب الإنجاز للخدمات العامة" });
  await expect(row.getByTestId("bid-rating")).not.toContainText("لا تقييمات");
});

test("المزوّد يرى سجل العميل بلا هوية عند تقديم العرض", async ({ page }) => {
  await logIn(page, "provider3@mueqeb.test");
  await page.goto("/dashboard/provider/requests");
  await page.getByRole("link", { name: /إصدار رخص عمل لثلاثة عمال/ }).click();
  const stats = page.getByTestId("client-stats");
  // المنشأة في seed: تقييمان من المكاتب (متوسط 4.5) وطلبان مكتملان
  await expect(stats).toContainText("تقييمه 4.5/5");
  await expect(stats).toContainText("طلبات مكتملة");
  await expect(page.getByTestId("request-summary")).not.toContainText("مؤسسة البناء الحديث");
});
