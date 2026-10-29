/**
 * مُجدول المهام داخل خادم التطبيق (بديل pg_cron).
 * المهام معلنة في cron.job عبر cron.schedule() في الـ migrations، بصيغة «كل N دقيقة» فقط.
 * كل دقيقة: قفل استشاري يضمن تنفيذ نسخة واحدة فقط حتى مع أكثر من خادم، ثم تُنفَّذ المهام المستحقة
 * بهوية الخادم (service_role) ويُسجَّل وقت آخر تشغيل وآخر خطأ.
 */
import { dbFor, SERVICE } from "@/lib/db/core";
import { deliverPendingNotifications } from "@/lib/notifications/deliver";
import { logError } from "@/lib/log";

const TICK_MS = 60_000;
const LOCK_KEY = "mueqeb_scheduler";

type Job = { jobname: string; schedule: string; command: string; last_run_at: string | null };

function intervalMinutes(schedule: string) {
  const match = /^\*\/(\d+) \* \* \* \*$/.exec(schedule);
  return match ? Number(match[1]) : null;
}

export async function runDueJobs(now = Date.now()) {
  const db = dbFor(SERVICE);
  return db.transaction(async (tx) => {
    const [{ locked }] = await tx.query<{ locked: boolean }>(
      "select pg_try_advisory_xact_lock(hashtext($1)) as locked",
      [LOCK_KEY],
    );
    if (!locked) return [];

    const jobs = await tx.query<Job>(
      "select jobname, schedule, command, last_run_at from cron.job where active order by jobname",
    );
    const ran: string[] = [];
    for (const job of jobs) {
      const minutes = intervalMinutes(job.schedule);
      if (!minutes) continue;
      const last = job.last_run_at ? Date.parse(job.last_run_at) : 0;
      if (now - last < minutes * 60_000 - 5_000) continue;

      // كل مهمة في نقطة حفظ: فشل مهمة لا يُلغي غيرها ولا يُسقط تسجيل الخطأ
      await tx.query("savepoint job");
      let error: string | null = null;
      try {
        await tx.query(job.command);
        await tx.query("release savepoint job");
      } catch (err) {
        await tx.query("rollback to savepoint job");
        error = (err as Error).message;
        logError(`scheduled job ${job.jobname}`, err);
      }
      await tx.query(
        "update cron.job set last_run_at = now(), last_error = $2 where jobname = $1",
        [job.jobname, error],
      );
      ran.push(job.jobname);
    }
    return ran;
  });
}

const state = globalThis as unknown as { __mueqebScheduler?: ReturnType<typeof setInterval> };

export function startScheduler() {
  if (state.__mueqebScheduler) return;
  const tick = async () => {
    await runDueJobs().catch((err) => logError("scheduler tick", err));
    // الإشعارات الخارجية (البريد) من صندوق الإرسال
    await deliverPendingNotifications().catch((err) => logError("notification delivery", err));
  };
  state.__mueqebScheduler = setInterval(tick, TICK_MS);
  state.__mueqebScheduler.unref?.();
  setTimeout(tick, 5_000).unref?.();
}
