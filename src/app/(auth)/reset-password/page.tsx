import type { Metadata } from "next";
import Link from "next/link";
import { isTokenValid } from "@/lib/auth/one-time-tokens";
import { Card, PageTitle } from "@/components/ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "تعيين كلمة مرور جديدة", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && (await isTokenValid(token, "password_reset"));

  return (
    <div className="mx-auto max-w-md">
      <PageTitle>تعيين كلمة مرور جديدة</PageTitle>
      <Card className="space-y-4">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p role="alert" data-testid="reset-invalid">
            الرابط غير صالح أو منتهٍ أو استُخدم من قبل.{" "}
            <Link href="/forgot-password" className="text-primary hover:underline">
              اطلب رابطاً جديداً
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
