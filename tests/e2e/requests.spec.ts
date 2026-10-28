import { expect, test, type Browser, type Page } from "@playwright/test";
import { logIn } from "./helpers";

test.describe.configure({ timeout: 120_000 });

/** معرّف فريد بلا تسلسل أرقام طويل (الأرقام الطويلة تُعامل كرقم جوال وتُرفض) */
const tag = () => Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");

async function as(browser: Browser, identifier: string) {
  const page = await (await browser.newContext()).newPage();
  await logIn(page, identifier);
  return page;
}

async function providerBids(page: Page, description: string, fee: string, belowMin = false) {
  await page.goto("/dashboard/provider/requests");
  await page.getByRole("link", { name: new RegExp(description) }).click();
  await expect(page).toHaveURL(/\/dashboard\/provider\/requests\/[0-9a-f-]{36}$/);
  // لا بيانات عميل قبل الترسية
  await expect(page.getByTestId("client-details")).toHaveCount(0);

  if (belowMin) {
    await page.getByLabel("أتعابك (ريال)").fill("50");
    await page.getByLabel("المدة (أيام)").fill("3");
    await page.getByLabel("ما يشمله العرض").fill("إصدار الرخص ومتابعتها");
    await page.getByRole("button", { name: "قدّم العرض" }).click();
    await expect(page.getByText("الحد الأدنى لأتعاب هذه الخدمة 100 ر.س")).toBeVisible();
  }

  await page.getByLabel("أتعابك (ريال)").fill(fee);
  await page.getByLabel("المدة (أيام)").fill("3");
  await page.getByLabel("ما يشمله العرض").fill("إصدار الرخص ومتابعتها حتى التفعيل");
  await page.getByLabel("ما تحتاجه من العميل").fill("تفويض المكتب في قوى");
  await page.getByRole("button", { name: /قدّم العرض|حفظ التعديل/ }).click();
  await expect(page.getByText("حُفظ عرضك.")).toBeVisible();
  await expect(page.getByTestId("my-bid")).toContainText(`${fee} ر.س`);
  return page.url();
}

test("معيار القبول: طلب عام من منشأة، 3 عروض مغلقة، اختيار عرض → awarded_unpaid", async ({
  browser,
}) => {
  const description = `إصدار رخص عمل لعمال المستودع ${tag()}`;

  // 1) المنشأة تنشر طلباً عاماً
  const requester = await as(browser, "establishment@mueqeb.test");
  await requester.goto("/dashboard/requester/requests/new");
  await requester.getByLabel("الخدمة").selectOption({ label: "إصدار أو تجديد رخصة عمل" });
  await expect(requester.getByTestId("service-info")).toContainText("150 ر.س – 300 ر.س");
  await requester.getByLabel("صورة إقامة العامل").check();
  await requester.getByLabel("المدينة").selectOption("الرياض");
  await requester.getByLabel("مستعجل").check();
  await requester.getByLabel("وصف الطلب").fill(description);
  await requester
    .getByLabel("ملاحظات خاصة (اختياري)")
    .fill("المسؤول: أبو فهد، يفضّل التواصل مساءً");
  await requester.getByRole("button", { name: "انشر الطلب" }).click();
  await expect(requester).toHaveURL(/\/dashboard\/requester\/requests\/[0-9a-f-]{36}$/);
  await expect(requester.getByTestId("request-status")).toHaveText("مفتوح");

  // 2) ثلاثة مزوّدين يقدّمون عروضاً
  const fees = { p1: "210", p3: "190", p4: "235" };
  const p1 = await as(browser, "provider1@mueqeb.test");
  const p3 = await as(browser, "provider3@mueqeb.test");
  const p4 = await as(browser, "provider4@mueqeb.test");
  await providerBids(p1, description, fees.p1, true);
  await providerBids(p3, description, fees.p3);
  await providerBids(p4, description, fees.p4);

  // 3) كل مزوّد لا يرى غير عرضه
  for (const [page, own] of [
    [p1, fees.p1],
    [p3, fees.p3],
    [p4, fees.p4],
  ] as const) {
    await page.reload();
    const body = await page.locator("main").innerText();
    expect(body).toContain(`${own} ر.س`);
    for (const other of Object.values(fees).filter((f) => f !== own)) {
      expect(body).not.toContain(`${other} ر.س`);
    }
    expect(body).not.toContain("أبو فهد");
    expect(body).not.toContain("مؤسسة البناء الحديث");
  }

  // 4) العميل يقارن العروض الثلاثة ويختار عرض المزوّد 3
  await requester.reload();
  await expect(requester.getByTestId("bid-row")).toHaveCount(3);
  const table = requester.getByTestId("bids-table");
  await expect(table).toContainText("مكتب الريادة للخدمات العامة");
  await expect(table).toContainText("الأقل");
  requester.once("dialog", (d) => d.accept());
  await requester
    .getByTestId("bid-row")
    .filter({ hasText: "مكتب الريادة للخدمات العامة" })
    .getByRole("button", { name: "اختيار هذا العرض" })
    .click();
  // الصفحة تُحدَّث فوراً بالحالة الجديدة (والتحديث يؤكد أنها محفوظة)
  await expect(requester.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");
  await requester.reload();
  await expect(requester.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");
  await expect(requester.getByTestId("awarded-bid")).toContainText("190 ر.س");
  await expect(requester.getByTestId("order-events")).toContainText(
    "تم اختيار عرض — بانتظار الدفع",
  );

  // 5) الفائز وحده يرى بيانات العميل
  await p3.reload();
  await expect(p3.getByTestId("client-details")).toContainText("مؤسسة البناء الحديث");
  await expect(p3.getByTestId("client-details")).toContainText("أبو فهد");
  for (const loser of [p1, p4]) {
    await loser.reload();
    await expect(loser.getByTestId("client-details")).toHaveCount(0);
    await expect(loser.getByTestId("my-bid")).toContainText("لم يُختر");
  }
});

test("طلب مباشر بالسعر المعلن يُرسى فوراً", async ({ browser }) => {
  const requester = await as(browser, "0500000003");
  await requester.goto("/providers");
  await requester.getByRole("link", { name: /مكتب الإنجاز للخدمات العامة/ }).click();
  await requester
    .getByTestId("provider-services")
    .locator("li")
    .filter({ hasText: "إصدار أو تجديد رخصة عمل" })
    .getByRole("link", { name: "اطلب بالسعر المعلن" })
    .click();
  await expect(requester.getByTestId("service-info")).toContainText("السعر المعلن: 180 ر.س");
  await requester.getByLabel("المدينة").selectOption("الرياض");
  await requester.getByRole("button", { name: "أرسل الطلب بالسعر المعلن" }).click();

  await expect(requester.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");
  await expect(requester.getByTestId("awarded-bid")).toContainText("مكتب الإنجاز للخدمات العامة");
  await expect(requester.getByTestId("awarded-bid")).toContainText("180 ر.س");
});

test("طلب عرض خاص يصل للمكتب المستهدف وحده", async ({ browser }) => {
  const description = `تعديل نشاط السجل لإضافة نشاط تجاري ${tag()}`;
  const requester = await as(browser, "0500000003");
  await requester.goto("/providers");
  await requester.getByRole("link", { name: /مكتب المسار للتعقيب/ }).click();
  await requester
    .getByTestId("provider-services")
    .locator("li")
    .filter({ hasText: "تعديل نشاط السجل التجاري" })
    .getByRole("link", { name: "اطلب عرضاً خاصاً" })
    .click();
  await requester.getByLabel("المدينة").selectOption("الرياض");
  await requester.getByLabel("وصف الطلب (اختياري)").fill(description);
  await requester.getByRole("button", { name: "اطلب عرض السعر" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("مفتوح");

  const target = await as(browser, "provider4@mueqeb.test");
  await target.goto("/dashboard/provider/requests");
  const card = target
    .getByTestId("provider-requests")
    .locator("li")
    .filter({ hasText: description });
  await expect(card).toContainText("موجّه إليك");

  // مزوّد آخر يقدّم الخدمة نفسها في المدينة نفسها لا يراه
  const other = await as(browser, "provider1@mueqeb.test");
  await other.goto("/dashboard/provider/requests");
  await expect(other.getByText(description)).toHaveCount(0);
});

test("وصف يحوي رقم جوال يُرفض مع إبقاء القيم", async ({ page }) => {
  await logIn(page, "establishment@mueqeb.test");
  await page.goto("/dashboard/requester/requests/new");
  await page.getByLabel("الخدمة").selectOption({ label: "تسجيل منشأة في التأمينات" });
  await page.getByLabel("المدينة").selectOption("الدمام");
  await page.getByLabel("وصف الطلب").fill("أرجو التواصل على 0551234567 لتسجيل المنشأة");
  await page.getByRole("button", { name: "انشر الطلب" }).click();
  await expect(page.getByText(/لا تكتب أرقام جوال/)).toBeVisible();
  await expect(page).toHaveURL(/\/requests\/new$/);
  await expect(page.getByLabel("المدينة")).toHaveValue("الدمام");
});

test("مزوّد غير معتمد لا يرى الطلبات", async ({ page }) => {
  await logIn(page, "0500000002");
  await page.goto("/dashboard/provider/requests");
  await expect(page.getByText("تظهر الطلبات بعد اعتماد الإدارة لمكتبك.")).toBeVisible();
});
