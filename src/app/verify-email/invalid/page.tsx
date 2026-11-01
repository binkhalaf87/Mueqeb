import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "رابط التأكيد غير صالح", robots: { index: false } };

export default function InvalidVerificationPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle>رابط التأكيد غير صالح</PageTitle>
      <Card className="space-y-3" data-testid="verify-invalid">
        <p>الرابط منتهٍ أو استُخدم من قبل، أو تغيّر بريد الحساب بعد إرساله.</p>
        <p className="text-sm text-muted">
          ادخل لحسابك واطلب رابطاً جديداً من الشريط أعلى الصفحة أو من «حسابي».
        </p>
        <Link href="/dashboard/account" className="text-primary hover:underline">
          الذهاب لحسابي
        </Link>
      </Card>
    </div>
  );
}
