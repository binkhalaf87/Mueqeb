import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { formatDateTime } from "@/lib/format";
import { markAllNotificationsRead, openNotification } from "@/app/actions/notifications";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "الإشعارات" };

export default async function NotificationsPage() {
  await requireUser();
  const db = await getDb();
  const notifications = await db.query<
    Pick<Tables<"notifications">, "id" | "title" | "body" | "link" | "read_at" | "created_at">
  >(
    `select id, title, body, link, read_at, created_at
     from public.notifications order by id desc limit 100`,
  );
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle subtitle="تصلك نسخة بالبريد أيضاً إن كان لحسابك بريد.">الإشعارات</PageTitle>
      {unread > 0 && (
        <form action={markAllNotificationsRead}>
          <button type="submit" className="text-sm text-primary hover:underline">
            تحديد الكل كمقروء ({unread})
          </button>
        </form>
      )}
      <Card className="p-0">
        {!notifications.length ? (
          <p className="p-6 text-sm text-muted">لا توجد إشعارات بعد.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="notifications">
            {notifications.map((n) => (
              <li key={n.id}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className={`block w-full space-y-1 px-6 py-4 text-start hover:bg-background ${
                      n.read_at ? "text-muted" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {!n.read_at && (
                        <span aria-label="غير مقروء" className="size-2 rounded-full bg-primary" />
                      )}
                      <span className="font-medium">{n.title}</span>
                      <span className="ms-auto text-xs text-muted">
                        {formatDateTime(n.created_at)}
                      </span>
                    </span>
                    {n.body && <span className="block text-sm">{n.body}</span>}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
