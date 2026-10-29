/**
 * يرسل الإشعارات المعلّقة من notification_outbox عبر القنوات (يستدعيه مُجدول الخادم كل دقيقة).
 * FOR UPDATE SKIP LOCKED يمنع إرسال الإشعار نفسه مرتين حتى مع أكثر من نسخة خادم.
 */
import { dbFor, SERVICE } from "@/lib/db/core";
import { getNotificationProvider } from "./index";
import type { ChannelName } from "./types";

const MAX_ATTEMPTS = 5;

type Pending = {
  id: number;
  channel: ChannelName;
  attempts: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
};

function appUrl(link: string | null) {
  if (!link) return null;
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}${link}` : null;
}

export async function deliverPendingNotifications(limit = 50) {
  const provider = getNotificationProvider();
  return dbFor(SERVICE).transaction(async (tx) => {
    const rows = await tx.query<Pending>(
      `select o.id, o.channel, o.attempts, n.kind, n.title, n.body, n.link,
              p.full_name, u.email, u.phone
       from public.notification_outbox o
       join public.notifications n on n.id = o.notification_id
       join public.profiles p on p.id = n.user_id
       join auth.users u on u.id = n.user_id
       where o.status = 'pending'
       order by o.id
       limit $1
       for update of o skip locked`,
      [limit],
    );
    const counts = { sent: 0, skipped: 0, failed: 0 };
    for (const row of rows) {
      try {
        const result = await provider.channel(row.channel).send({
          kind: row.kind,
          title: row.title,
          body: row.body,
          url: appUrl(row.link),
          recipient: { name: row.full_name, email: row.email, phone: row.phone },
        });
        await tx.query(
          `update public.notification_outbox
           set status = $2, attempts = attempts + 1, last_error = $3,
               sent_at = case when $2 = 'sent' then now() end
           where id = $1`,
          [row.id, result.status, result.status === "skipped" ? result.reason : null],
        );
        counts[result.status]++;
      } catch (error) {
        const failed = row.attempts + 1 >= MAX_ATTEMPTS;
        await tx.query(
          `update public.notification_outbox
           set status = $2, attempts = attempts + 1, last_error = $3 where id = $1`,
          [row.id, failed ? "failed" : "pending", String((error as Error).message).slice(0, 500)],
        );
        if (failed) counts.failed++;
      }
    }
    return counts;
  });
}
