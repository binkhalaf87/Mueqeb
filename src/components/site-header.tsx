import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABEL, homePathForRole, navForRole } from "@/lib/auth/routes";
import { signOut } from "@/app/actions/auth";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link
          href={user ? homePathForRole(user.role) : "/"}
          className="text-xl font-bold text-primary"
        >
          مُعقّب
        </Link>

        {user ? (
          <nav aria-label="القائمة الرئيسية" className="flex gap-4 text-sm">
            {navForRole(user.role).map((item) => (
              <Link key={item.href} href={item.href} className="text-foreground hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav aria-label="القائمة الرئيسية" className="flex gap-4 text-sm">
            <Link href="/providers" className="text-foreground hover:text-primary">
              تصفح المزوّدين
            </Link>
          </nav>
        )}

        <div className="ms-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link
                href="/dashboard/account"
                className="text-muted hover:text-primary"
                data-testid="current-user"
                title="حسابي"
              >
                {user.fullName || "مستخدم"}
                {user.role && (
                  <span className="ms-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                    {ROLE_LABEL[user.role]}
                  </span>
                )}
              </Link>
              <form action={signOut}>
                <button type="submit" className="text-muted hover:text-danger">
                  خروج
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-primary">
                دخول
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-hover"
              >
                حساب جديد
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
