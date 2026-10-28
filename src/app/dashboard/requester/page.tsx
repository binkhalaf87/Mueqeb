import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "لوحة طالب الخدمة" };

export default async function RequesterDashboard() {
  const user = await requireRole("requester");
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("establishment_members")
    .select("member_role, requester_accounts(account_type, establishment_name, cr_number)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const account = membership?.requester_accounts;

  return (
    <div>
      <PageTitle subtitle="هنا ستظهر طلباتك وعروض المزوّدين.">لوحة طالب الخدمة</PageTitle>
      <Card className="space-y-2" data-testid="requester-account">
        <h2 className="font-semibold">حسابك</h2>
        {account?.account_type === "establishment" ? (
          <p>
            منشأة: {account.establishment_name} — سجل تجاري{" "}
            <span dir="ltr">{account.cr_number}</span>
            {membership?.member_role === "owner" && " (مالك)"}
          </p>
        ) : (
          <p>حساب فردي</p>
        )}
      </Card>
      <p className="mt-6 text-sm text-muted">لا توجد طلبات بعد. (قيد البناء في مرحلة لاحقة)</p>
    </div>
  );
}
