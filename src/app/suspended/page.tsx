import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/routes";
import { signOut } from "@/app/actions/auth";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "الحساب موقوف" };

export default async function SuspendedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.suspended) redirect(homePathForRole(user.role));

  return (
    <Card className="mx-auto max-w-md space-y-3 text-center" data-testid="suspended">
      <h1 className="text-xl font-bold">حسابك موقوف</h1>
      {user.suspensionReason && (
        <p>
          <span className="text-muted">السبب: </span>
          {user.suspensionReason}
        </p>
      )}
      <p className="text-sm text-muted">للاستفسار تواصل مع إدارة المنصة.</p>
      <form action={signOut}>
        <button type="submit" className="text-primary hover:underline">
          تسجيل الخروج
        </button>
      </form>
    </Card>
  );
}
