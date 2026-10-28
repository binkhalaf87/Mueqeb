import { expect, type Browser, type Page } from "@playwright/test";
import { logIn } from "./helpers";

/** تدفقات مشتركة لاختبارات ما بعد الدفع */
const pdf = (name: string) => ({
  name: `${name}.pdf`,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF`),
});

export async function as(browser: Browser, identifier: string) {
  const page = await (await browser.newContext()).newPage();
  await logIn(page, identifier);
  return page;
}

export const accept = (page: Page) => page.once("dialog", (d) => d.accept());

/** طلب مباشر بالسعر المعلن من «مكتب الإنجاز» (رخصة عمل — قوى) ثم الدفع ببطاقة الاختبار */
export async function paidRequest(browser: Browser) {
  const requester = await as(browser, "0500000003");
  await requester.goto("/providers");
  await requester.getByRole("link", { name: /مكتب الإنجاز للخدمات العامة/ }).click();
  await requester
    .getByTestId("provider-services")
    .locator("li")
    .filter({ hasText: "إصدار أو تجديد رخصة عمل" })
    .getByRole("link", { name: "اطلب بالسعر المعلن" })
    .click();
  await requester.getByLabel("المدينة").selectOption("الرياض");
  await requester.getByRole("button", { name: "أرسل الطلب بالسعر المعلن" }).click();
  await requester.getByRole("link", { name: /ادفع الآن/ }).click();
  await requester.getByRole("button", { name: /بالبطاقة/ }).click();
  await requester.getByLabel("رقم البطاقة").fill("4111111111111111");
  await requester.getByRole("button", { name: "ادفع", exact: true }).click();
  await expect(requester.getByTestId("request-status")).toHaveText("بانتظار التفويض والمستندات");
  const requestId = new URL(requester.url()).pathname.split("/").pop()!;
  return { requester, requestId };
}

/** التفويض + مستند العميل + بدء التنفيذ + إثبات + تسليم */
export async function deliver(browser: Browser, requester: Page, requestId: string) {
  const guide = requester.getByTestId("delegation-guide");
  await expect(guide).toContainText("تفويض المكتب عبر منصة قوى");
  await expect(guide).toContainText("لن نطلب منك أبداً كلمة مرور");
  // لا حقول لكلمات مرور في صفحة الطلب إطلاقاً
  await expect(requester.locator('input[type="password"]')).toHaveCount(0);

  const upload = requester.getByTestId("upload-client-document");
  await upload.getByLabel("الملف").setInputFiles(pdf("iqama"));
  await upload.getByRole("button", { name: "رفع" }).click();
  await expect(requester.getByTestId("client-documents")).toContainText("iqama.pdf");

  const provider = await as(browser, "provider1@mueqeb.test");
  await provider.goto(`/dashboard/provider/requests/${requestId}`);
  await provider.getByRole("button", { name: "بدء التنفيذ" }).click();
  await expect(provider.getByText("بانتظار تأكيد العميل لمنح التفويض.")).toBeVisible();

  await requester.getByRole("button", { name: "تم منح التفويض" }).click();
  await expect(requester.getByTestId("delegation-guide")).toContainText("تم منح التفويض");

  await provider.reload();
  await expect(provider.getByTestId("provider-client-documents")).toContainText("iqama.pdf");
  await provider.getByRole("button", { name: "بدء التنفيذ" }).click();
  await expect(provider.getByTestId("request-status")).toHaveText("قيد التنفيذ");

  const proof = provider.getByTestId("upload-proof");
  await proof.getByLabel("الملف").setInputFiles(pdf("permit-proof"));
  await proof.getByRole("button", { name: "رفع" }).click();
  await expect(provider.getByTestId("provider-execution")).toContainText("permit-proof.pdf");
  await provider.getByLabel("وصف ما أُنجز").fill("صدرت رخصة العمل وأُرفق إثبات الإصدار");
  await provider.getByRole("button", { name: "تسليم الخدمة" }).click();
  await expect(provider.getByTestId("request-status")).toHaveText("تم التسليم — بانتظار التأكيد");

  await requester.reload();
  await expect(requester.getByTestId("delivery")).toContainText("permit-proof.pdf");
  return provider;
}

export async function expectLedgerBalanced(browser: Browser, text: string) {
  const admin = await as(browser, "admin@mueqeb.test");
  await admin.goto("/admin/ledger");
  await expect(admin.getByTestId("ledger-imbalance")).toHaveText("متوازن ✓");
  const order = admin.getByTestId("ledger-order").filter({ hasText: text }).first();
  await expect(order).toContainText("متوازن");
  return { admin, order };
}
