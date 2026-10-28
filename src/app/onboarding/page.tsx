import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/routes";
import { PageTitle } from "@/components/ui";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "إكمال التسجيل" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.role) redirect(homePathForRole(user.role));

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle subtitle="اختر كيف ستستخدم المنصة. لا يمكن تغيير هذا الاختيار لاحقاً من حسابك.">
        أهلاً {user.fullName}
      </PageTitle>
      <OnboardingForm />
    </div>
  );
}
