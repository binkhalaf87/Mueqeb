import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "لوحة المزوّد" };

export default async function ProviderDashboard() {
  await requireRole("provider");

  return (
    <div>
      <PageTitle subtitle="هنا ستظهر الطلبات المتاحة لك وعروضك.">لوحة المزوّد</PageTitle>
      <Card>
        <h2 className="font-semibold">حسابك بانتظار التوثيق</h2>
        <p className="mt-1 text-sm text-muted">
          لن تستقبل طلبات حتى تعتمد الإدارة توثيق مكتبك. (التوثيق قيد البناء في مرحلة لاحقة)
        </p>
      </Card>
    </div>
  );
}
