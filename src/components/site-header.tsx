import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABEL, homePathForRole, navForRole } from "@/lib/auth/routes";
import { signOut } from "@/app/actions/auth";
import { getDb } from "@/lib/db/server";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user
    ? (
        await (
          await getDb()
        ).one<{ count: number }>(
          "select count(*) as count from public.notifications where read_at is null",
        )
      ).count
    : 0;

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
                href="/dashboard/notifications"
                className="relative text-muted hover:text-primary"
                data-testid="notifications-bell"
                aria-label={unread ? `الإشعارات: ${unread} غير مقروء` : "الإشعارات"}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="currentColor">
                  <path d="M10 2a6 6 0 00-6 6v3.6l-1.4 2.1A.8.8 0 003.3 15h13.4a.8.8 0 00.7-1.3L16 11.6V8a6 6 0 00-6-6zm0 16a2.5 2.5 0 01-2.4-1.8h4.8A2.5 2.5 0 0110 18z" />
                </svg>
                {unread > 0 && (
                  <span
                    className="absolute -end-2 -top-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 text-white"
                    data-testid="unread-count"
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
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
