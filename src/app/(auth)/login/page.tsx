import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reset, verified } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageTitle>تسجيل الدخول</PageTitle>
      <Card>
        {reset === "1" && (
          <p role="status" className="mb-4 rounded-lg bg-primary-soft px-3 py-2 text-sm">
            تغيّرت كلمة المرور. سجّل الدخول بها الآن.
          </p>
        )}
        {verified === "1" && (
          <p role="status" className="mb-4 rounded-lg bg-primary-soft px-3 py-2 text-sm">
            تأكّد بريدك الإلكتروني. سجّل الدخول للمتابعة.
          </p>
        )}
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-muted">
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="text-primary hover:underline">
            أنشئ حساباً
          </Link>
        </p>
      </Card>
    </div>
  );
}
