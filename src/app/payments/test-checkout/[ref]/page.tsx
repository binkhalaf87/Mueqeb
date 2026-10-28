import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPaymentProvider } from "@/lib/payments";
import { MockGateway } from "@/lib/payments/mock-gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHalalas } from "@/lib/money";
import { Card } from "@/components/ui";
import { TestCardForm } from "./test-card-form";

export const metadata: Metadata = { title: "بوابة الدفع التجريبية" };

/**
 * صفحة «البوابة المستضافة» لبوابة الاختبار المحلية — تحاكي صفحة Moyasar.
 * متاحة فقط عند PAYMENT_PROVIDER=mock.
 */
export default async function TestCheckoutPage({
  params,
}: PageProps<"/payments/test-checkout/[ref]">) {
  if (!(getPaymentProvider() instanceof MockGateway)) notFound();
  const { ref } = await params;
  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("amount_halalas, status")
    .eq("gateway", "mock")
    .eq("provider_ref", ref)
    .maybeSingle();
  if (!payment) notFound();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        بوابة دفع تجريبية — لا تُدخل بيانات بطاقة حقيقية
      </p>
      <Card className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted">المبلغ المطلوب</p>
          <p className="text-3xl font-bold" data-testid="checkout-amount">
            {formatHalalas(payment.amount_halalas)}
          </p>
        </div>
        {payment.status === "initiated" ? (
          <TestCardForm providerRef={ref} />
        ) : (
          <p className="text-center text-muted">انتهت جلسة الدفع هذه ({payment.status}).</p>
        )}
      </Card>
      <div className="text-xs text-muted">
        <p>بطاقات الاختبار:</p>
        <p dir="ltr">4111 1111 1111 1111 — ناجحة</p>
        <p dir="ltr">4000 0000 0000 0002 — مرفوضة</p>
      </div>
    </div>
  );
}
