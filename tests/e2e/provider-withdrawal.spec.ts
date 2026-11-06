import { expect, test } from "@playwright/test";
import { accept, as, expectLedgerBalanced, paidRequest } from "./flows";

test.describe.configure({ timeout: 180_000 });

test("المكتب يعتذر عن طلب مدفوع: استرداد كامل للعميل، ويظهر في سجل المكتب للإدارة", async ({
  browser,
}) => {
  const { requester, requestId } = await paidRequest(browser);

  const provider = await as(browser, "provider1@mueqeb.test");
  await provider.goto(`/dashboard/provider/requests/${requestId}`);
  const form = provider.getByTestId("provider-withdraw");
  await expect(form).toContainText("يُسترد للعميل المبلغ كاملاً");

  // السبب إلزامي
  accept(provider);
  await form.getByRole("button", { name: "الاعتذار عن الطلب" }).click();
  await expect(form.getByText(/اكتب سبب الاعتذار/)).toBeVisible();

  const reason = "تعطّل نظام المكتب ولا يمكننا الالتزام بالموعد";
  await form.getByLabel("سبب الاعتذار").fill(reason);
  accept(provider);
  await form.getByRole("button", { name: "الاعتذار عن الطلب" }).click();
  await expect(provider.getByTestId("request-status")).toHaveText("ملغي");
  await expect(provider.getByTestId("provider-withdraw")).toHaveCount(0);

  // العميل: الطلب ملغى، والسبب في سجل الأحداث، والإشعار وصل
  await requester.reload();
  await expect(requester.getByTestId("request-status")).toHaveText("ملغي");
  await expect(requester.getByTestId("order-events")).toContainText(reason);
  await requester.goto("/dashboard/notifications");
  await expect(requester.getByTestId("notifications")).toContainText("اعتذر المكتب عن طلبك");

  // الإدارة: الدفتر متوازن، والاعتذار في سجل المكتب
  const { admin } = await expectLedgerBalanced(browser, "استرداد كامل للعميل");
  await admin.goto("/admin/providers?stage=approved");
  await admin
    .getByRole("link", { name: /مكتب الإنجاز للخدمات العامة/ })
    .first()
    .click();
  await expect(admin.getByTestId("provider-withdrawals")).toContainText(reason);
});
