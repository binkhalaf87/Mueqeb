import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "نسيت كلمة المرور", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle subtitle="أدخل بريد حسابك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.">
        نسيت كلمة المرور
      </PageTitle>
      <Card className="space-y-4">
        <ForgotPasswordForm />
        <p className="text-sm text-muted">
          سجّلت بالجوال دون بريد؟ الاستعادة بالرسائل النصية غير متاحة بعد؛ تواصل مع الدعم.
        </p>
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </p>
      </Card>
    </div>
  );
}
