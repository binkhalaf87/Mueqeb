import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageTitle>تسجيل الدخول</PageTitle>
      <Card>
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="mt-4 text-center text-sm text-muted">
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="text-primary hover:underline">
            أنشئ حساباً
          </Link>
        </p>
      </Card>
    </div>
  );
}
