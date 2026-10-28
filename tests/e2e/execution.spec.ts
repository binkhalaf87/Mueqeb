import { expect, test } from "@playwright/test";
import { accept, as, deliver, expectLedgerBalanced, paidRequest } from "./flows";

test.describe.configure({ timeout: 180_000 });

test("معيار القبول 1: من الدفع حتى completed، والدفتر متوازن", async ({ browser }) => {
  const { requester, requestId } = await paidRequest(browser);
  await deliver(browser, requester, requestId);

  accept(requester);
  await requester.getByRole("button", { name: "تأكيد الإنجاز" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("مكتمل");
  await expect(requester.getByTestId("payment-status")).toContainText("حُوّل مستحق المكتب");

  const { order } = await expectLedgerBalanced(browser, "مستحق للمزوّد");
  // 180 أتعاب + 9 رسم: إيراد المنصة 9 + 27 = 36، ومستحق المزوّد 153
  await expect(order).toContainText("36 ر.س");
  await expect(order).toContainText("153 ر.س");
});

test("معيار القبول 2: نزاع واسترداد جزئي، والدفتر متوازن", async ({ browser }) => {
  const { requester, requestId } = await paidRequest(browser);
  await deliver(browser, requester, requestId);

  const form = requester.getByTestId("dispute-form").first();
  await form.getByLabel("سبب الاعتراض").fill("صدرت رخصة عامل واحد فقط من اثنين");
  await form.getByRole("button", { name: "اعتراض" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("نزاع");

  const admin = await as(browser, "admin@mueqeb.test");
  await admin.goto(`/admin/disputes/${requestId}`);
  await expect(admin.getByTestId("dispute-reason")).toContainText("صدرت رخصة عامل واحد فقط");
  await expect(admin.getByTestId("dispute-documents")).toContainText("permit-proof.pdf");
  await expect(admin.getByTestId("dispute-events")).toContainText("قيد التنفيذ");
  await admin.getByLabel(/استرداد جزئي/).check();
  await admin.getByLabel("مبلغ الاسترداد (ريال)").fill("60");
  accept(admin);
  await admin.getByRole("button", { name: "تسجيل القرار" }).click();
  await expect(admin.getByTestId("dispute-decision")).toContainText("استُرد 60 ر.س");

  await requester.reload();
  await expect(requester.getByTestId("request-status")).toHaveText("تمت تسوية النزاع");
  await expect(requester.getByTestId("dispute")).toContainText("استُرد لك 60 ر.س");
  await expect(requester.getByTestId("payment-status")).toContainText("استُرد لك 60 ر.س");

  const { order } = await expectLedgerBalanced(browser, "استرداد جزئي للعميل");
  // متبقٍ 120 → عمولة 18؛ إيراد المنصة 9 + 18 = 27؛ مستحق المزوّد 102
  await expect(order).toContainText("60 ر.س");
  await expect(order).toContainText("27 ر.س");
  await expect(order).toContainText("102 ر.س");
});

test("المحادثة: تحديث لحظي، ورفض طلب رمز التحقق وتسجيله للإدارة", async ({ browser }) => {
  const { requester, requestId } = await paidRequest(browser);
  const provider = await as(browser, "provider1@mueqeb.test");
  await provider.goto(`/dashboard/provider/requests/${requestId}`);
  await expect(provider.getByTestId("chat")).toBeVisible();

  const text = `مرحباً، متى تبدأ؟ ${Math.random().toString(36).slice(2, 6).replace(/\d/g, "x")}`;
  await requester.getByTestId("chat").getByPlaceholder("اكتب رسالتك…").fill(text);
  await requester.getByTestId("chat").getByRole("button", { name: "إرسال" }).click();
  // تظهر عند المزوّد دون إعادة تحميل
  await expect(provider.getByTestId("chat-messages")).toContainText(text, { timeout: 15_000 });

  const asking = "أرسل لي رمز التحقق الذي وصلك لأدخل حسابك";
  await provider.getByTestId("chat").getByPlaceholder("اكتب رسالتك…").fill(asking);
  await provider.getByTestId("chat").getByRole("button", { name: "إرسال" }).click();
  await expect(provider.getByTestId("chat-notice")).toContainText("لم تُرسل الرسالة");
  await expect(requester.getByTestId("chat-messages")).not.toContainText(asking);

  const admin = await as(browser, "admin@mueqeb.test");
  await admin.goto("/admin/reports");
  await expect(admin.getByTestId("blocked-messages")).toContainText(asking);
});

test("المحادثة قبل الترسية تحجب أرقام التواصل", async ({ browser }) => {
  const description = `طلب لاختبار المحادثة ${Math.random().toString(36).slice(2, 7).replace(/\d/g, "x")}`;
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
  await provider.getByLabel("أتعابك (ريال)").fill("200");
  await provider.getByLabel("المدة (أيام)").fill("2");
  await provider.getByLabel("ما يشمله العرض").fill("إصدار الرخصة كاملة");
  await provider.getByRole("button", { name: "قدّم العرض" }).click();
  await expect(provider.getByText("حُفظ عرضك.")).toBeVisible();

  await provider.getByTestId("chat").getByPlaceholder("اكتب رسالتك…").fill("كلمني على 0551234567");
  await provider.getByTestId("chat").getByRole("button", { name: "إرسال" }).click();
  await expect(provider.getByTestId("chat-notice")).toContainText("حُجبت");
  await expect(provider.getByTestId("chat-messages")).toContainText("كلمني على [محجوب]");

  await requester.reload();
  await expect(requester.getByTestId("chat").first()).toContainText("كلمني على [محجوب]");
  await expect(requester.getByText("0551234567")).toHaveCount(0);
});

test("الإلغاء بعد بدء التنفيذ: يُحتسب جزء للمزوّد والباقي يُسترد", async ({ browser }) => {
  const { requester, requestId } = await paidRequest(browser);
  await requester.getByRole("button", { name: "تم منح التفويض" }).click();
  const provider = await as(browser, "provider1@mueqeb.test");
  await provider.goto(`/dashboard/provider/requests/${requestId}`);
  await provider.getByRole("button", { name: "بدء التنفيذ" }).click();
  await expect(provider.getByTestId("request-status")).toHaveText("قيد التنفيذ");

  await requester.reload();
  // 180 × 30% = 54 للمزوّد → يُسترد 126
  accept(requester);
  await requester.getByRole("button", { name: "إلغاء الطلب (يُسترد 126 ر.س)" }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("ملغي");
  await expect(requester.getByTestId("payment-status")).toContainText("استُرد لك 126 ر.س");
  await expectLedgerBalanced(browser, "استرداد جزئي للعميل");
});
