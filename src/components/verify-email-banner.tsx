import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { ResendVerificationButton } from "./resend-verification-button";

/** شريط للحساب غير المؤكَّد: النشر والعروض والدفع وطلب التوثيق متوقفة حتى التأكيد */
export async function VerifyEmailBanner() {
  const user = await getCurrentUser();
  if (!user || user.suspended || user.contactVerified) return null;

  return (
    <div
      role="status"
      data-testid="verify-email-banner"
      className="border-b border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        {user.email ? (
          <>
            <span>
              أكّد بريدك <bdi dir="ltr">{user.email}</bdi> من الرابط المرسل إليه لتتمكن من نشر
              الطلبات وتقديم العروض والدفع.
            </span>
            <ResendVerificationButton />
          </>
        ) : (
          <span>
            سجّلت بالجوال: أضف بريداً إلكترونياً وأكّده من{" "}
            <Link href="/dashboard/account" className="font-medium underline">
              حسابي
            </Link>{" "}
            لتتمكن من نشر الطلبات وتقديم العروض والدفع.
          </span>
        )}
      </div>
    </div>
  );
}
