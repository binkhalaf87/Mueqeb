import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "حساب جديد" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { as } = await searchParams;
  const asProvider = as === "provider";
  return (
    <div className="mx-auto max-w-md">
      <PageTitle
        subtitle={
          asProvider
            ? "سجّل حساب مكتبك، ثم أكمل بيانات المكتب وارفع مستنداته لتراجعها الإدارة قبل ظهوره للعملاء."
            : "سجّل بجوالك أو بريدك الإلكتروني، ثم اختر كيف ستستخدم المنصة."
        }
      >
        {asProvider ? "انضم كمكتب تعقيب" : "إنشاء حساب"}
      </PageTitle>
      <Card>
        <SignupForm asProvider={asProvider} />
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
