import { expect, test, type Page } from "@playwright/test";
import { accept, as, expectLedgerBalanced } from "./flows";
import { signUp, uniqueCr, uniqueEmail } from "./helpers";

/**
 * معيار قبول المرحلة 8: المسار الكامل آلياً —
 * تسجيل منشأة ← طلب عام ← 3 عروض ← اختيار ← دفع اختبار ← تفويض ← تسليم ← تأكيد ← تقييم ← صرف
 */
test.describe.configure({ timeout: 240_000 });

const tag = () => Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
const WINNER = "مكتب المسار للتعقيب";

const pdf = (name: string) => ({
  name: `${name}.pdf`,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF`),
});

async function bid(page: Page, description: string, fee: string) {
  await page.goto("/dashboard/provider/requests");
  await page.getByRole("link", { name: new RegExp(description) }).click();
  await page.getByLabel("أتعابك (ريال)").fill(fee);
  await page.getByLabel("المدة (أيام)").fill("3");
  await page.getByLabel("ما يشمله العرض").fill("إصدار الرخصة ومتابعتها حتى التفعيل");
  await page.getByLabel("ما تحتاجه من العميل").fill("تفويض المكتب في قوى");
  await page.getByRole("button", { name: /قدّم العرض/ }).click();
  await expect(page.getByText("حُفظ عرضك.")).toBeVisible();
}

async function upload(page: Page, testId: string, name: string) {
  const form = page.getByTestId(testId);
  await form.getByLabel("الملف").setInputFiles(pdf(name));
  await form.getByRole("button", { name: "رفع" }).click();
}

test("المسار الكامل: من تسجيل المنشأة حتى صرف مستحقات المكتب", async ({ browser }) => {
  const description = `رخص عمل لفرع جديد ${tag()}`;
  const establishment = `مؤسسة الرحلة ${tag()}`;

  // 1) تسجيل منشأة جديدة
  const requester = await (await browser.newContext()).newPage();
  await signUp(requester, uniqueEmail(), "سعد العتيبي");
  await requester.getByText("أطلب خدمة").click();
  await requester.getByText("منشأة", { exact: true }).click();
  await requester.getByLabel("اسم المنشأة").fill(establishment);
  await requester.getByLabel("رقم السجل التجاري").fill(uniqueCr());
  await requester.getByRole("button", { name: "متابعة" }).click();
  await expect(requester).toHaveURL(/\/dashboard\/requester$/);

  // 2) طلب عام
  await requester.goto("/dashboard/requester/requests/new");
  await requester.getByLabel("الخدمة").selectOption({ label: "إصدار أو تجديد رخصة عمل" });
  await requester.getByLabel("صورة إقامة العامل").check();
  await requester.getByLabel("المدينة").selectOption("الرياض");
  await requester.getByLabel("وصف الطلب").fill(description);
  await requester.getByRole("button", { name: "انشر الطلب" }).click();
  await expect(requester).toHaveURL(/\/dashboard\/requester\/requests\/[0-9a-f-]{36}$/);
  await expect(requester.getByTestId("request-status")).toHaveText("مفتوح");
  const requestId = new URL(requester.url()).pathname.split("/").pop()!;

  // 3) ثلاثة عروض مغلقة
  const p1 = await as(browser, "provider1@mueqeb.test");
  const p3 = await as(browser, "provider3@mueqeb.test");
  const winner = await as(browser, "provider4@mueqeb.test");
  await bid(p1, description, "220");
  await bid(p3, description, "205");
  await bid(winner, description, "240");

  // 4) العميل يختار عرض «مكتب المسار» (ليس الأرخص)
  await requester.reload();
  await expect(requester.getByTestId("bid-row")).toHaveCount(3);
  accept(requester);
  await requester
    .getByTestId("bid-row")
    .filter({ hasText: WINNER })
    .getByRole("button", { name: "اختيار هذا العرض" })
    .click();
  await expect(requester.getByTestId("request-status")).toHaveText("تم اختيار عرض — بانتظار الدفع");

  // 5) دفع ببطاقة الاختبار
  await requester.getByRole("link", { name: /ادفع الآن/ }).click();
  await requester.getByRole("button", { name: /بالبطاقة/ }).click();
  await requester.getByLabel("رقم البطاقة").fill("4111111111111111");
  await requester.getByRole("button", { name: "ادفع", exact: true }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("بانتظار التفويض والمستندات");

  // 6) تفويض ومستندات (بلا أي حقل كلمة مرور)
  await expect(requester.locator('input[type="password"]')).toHaveCount(0);
  await upload(requester, "upload-client-document", "iqama");
  await expect(requester.getByTestId("client-documents")).toContainText("iqama.pdf");
  await requester.getByRole("button", { name: "تم منح التفويض" }).click();
  await expect(requester.getByTestId("delegation-guide")).toContainText("تم منح التفويض");

  // 7) المكتب ينفّذ ويسلّم بإثبات
  await winner.goto(`/dashboard/provider/requests/${requestId}`);
  await expect(winner.getByTestId("client-details")).toContainText(establishment);
  await winner.getByRole("button", { name: "بدء التنفيذ" }).click();
  await expect(winner.getByTestId("request-status")).toHaveText("قيد التنفيذ");
  await upload(winner, "upload-proof", "permit-proof");
  await expect(winner.getByTestId("provider-execution")).toContainText("permit-proof.pdf");
  await winner.getByLabel("وصف ما أُنجز").fill("صدرت الرخص وأُرفق الإثبات");
  await winner.getByRole("button", { name: "تسليم الخدمة" }).click();
  await expect(winner.getByTestId("request-status")).toHaveText("تم التسليم — بانتظار التأكيد");

  // 8) العميل يؤكد الإنجاز
  await requester.reload();
  await expect(requester.getByTestId("delivery")).toContainText("permit-proof.pdf");
  accept(requester);
  await requester.getByRole("button", { name: "تأكيد الإنجاز" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("مكتمل");

  // 9) التقييم المزدوج
  const form = requester.getByTestId("review-form");
  for (const label of ["السرعة 5", "الدقة 5", "التواصل 5"]) {
    await form.getByLabel(label, { exact: true }).check({ force: true });
  }
  await form.getByLabel("تعليق (اختياري)").fill("أنجزوا الرخص قبل الموعد");
  await requester.getByRole("button", { name: "إرسال التقييم" }).click();
  await expect(requester.getByTestId("my-review")).toContainText("السرعة 5 · الدقة 5 · التواصل 5");

  await winner.reload();
  for (const label of ["وضوح الطلب 5", "سرعة تسليم المستندات 5"]) {
    await winner
      .getByTestId("review-form")
      .getByLabel(label, { exact: true })
      .check({ force: true });
  }
  await winner.getByRole("button", { name: "إرسال التقييم" }).click();
  await expect(winner.getByTestId("their-review")).toContainText("أنجزوا الرخص قبل الموعد");

  // 10) الإدارة تصرف مستحقات المكتب، والدفتر متوازن
  const { admin } = await expectLedgerBalanced(browser, "مستحق للمزوّد");
  await admin.goto("/admin/payables");
  const row = admin.getByTestId("payable-row").filter({ hasText: WINNER });
  await expect(row.getByTestId("payable-outstanding")).not.toHaveText("0 ر.س");
  const ref = `TRX-${Date.now()}`;
  await row.getByPlaceholder("مرجع التحويل البنكي").fill(ref);
  accept(admin);
  await row.getByRole("button", { name: /تسجيل صرف/ }).click();
  await expect(admin.getByTestId("payouts-list")).toContainText(ref);

  // 11) إشعارات كل مرحلة وصلت للطرف الصحيح
  await requester.goto("/dashboard/notifications");
  const requesterNotes = requester.getByTestId("notifications");
  await expect(requesterNotes).toContainText("عرض جديد على طلبك");
  await expect(requesterNotes).toContainText("تم استلام دفعتك");

  await winner.goto("/dashboard/notifications");
  const winnerNotes = winner.getByTestId("notifications");
  await expect(winnerNotes).toContainText("تمت ترسية طلب عليك");
  await expect(winnerNotes).toContainText("دفع العميل");
  await expect(winnerNotes).toContainText("تم صرف مستحقاتك");
  await expect(winnerNotes).toContainText(ref);

  // ومستحقات المكتب في لوحته من الدفتر
  await winner.goto("/dashboard/provider");
  await expect(
    winner
      .getByTestId("provider-earnings")
      .locator("div")
      .filter({ hasText: "صُرف لك" })
      .locator("dd"),
  ).not.toHaveText("0 ر.س");
});
