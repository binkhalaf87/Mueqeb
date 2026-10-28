import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "حساب جديد" };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle subtitle="سجّل بجوالك أو بريدك الإلكتروني، ثم اختر كيف ستستخدم المنصة.">
        حساب جديد
      </PageTitle>
      <Card>
        <SignupForm />
        <p className="mt-4 text-center text-sm text-muted">
          لديك حساب؟{" "}
          <Link href="/login" className="text-primary hover:underline">
            سجّل الدخول
          </Link>
        </p>
      </Card>
    </div>
  );
}
