"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";

/** يعلّم الإشعار مقروءاً ثم يفتح رابطه (RLS: إشعارات المستخدم فقط) */
export async function openNotification(formData: FormData) {
  await requireUser();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) redirect("/dashboard/notifications");
  const db = await getDb();
  const row = await db.maybeOne<{ link: string | null }>(
    `update public.notifications set read_at = coalesce(read_at, now())
     where id = $1 returning link`,
    [id.data],
  );
  revalidatePath("/", "layout");
  redirect(row?.link ?? "/dashboard/notifications");
}

export async function markAllNotificationsRead() {
  await requireUser();
  const db = await getDb();
  await db.query("update public.notifications set read_at = now() where read_at is null");
  revalidatePath("/", "layout");
}
