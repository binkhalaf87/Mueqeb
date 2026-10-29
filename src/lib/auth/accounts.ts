/**
 * حسابات الدخول في auth.users (كلمات المرور bcrypt عبر pgcrypto).
 * تعمل بهوية الخادم (service) لأن الجدول غير مقروء للمستخدمين.
 */
import { dbFor, SERVICE, type Db } from "@/lib/db/core";
import type { Identifier } from "@/lib/auth/validation";

export type CreateAccountResult =
  { ok: true; userId: string } | { ok: false; reason: "exists" | "invalid" };

function identifierColumns(identifier: Identifier) {
  return identifier.kind === "email"
    ? { email: identifier.email.toLowerCase(), phone: null }
    : { email: null, phone: identifier.phone };
}

export async function createAccount(
  identifier: Identifier,
  password: string,
  fullName: string,
  db: Db = dbFor(SERVICE),
): Promise<CreateAccountResult> {
  const { email, phone } = identifierColumns(identifier);
  try {
    const row = await db.one<{ id: string }>(
      `insert into auth.users (email, phone, encrypted_password, raw_user_meta_data)
       values ($1, $2, public.crypt($3, public.gen_salt('bf', 10)), jsonb_build_object('full_name', $4::text))
       returning id`,
      [email, phone, password, fullName],
    );
    return { ok: true, userId: row.id };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { ok: false, reason: "exists" };
    if (code === "23514") return { ok: false, reason: "invalid" };
    throw error;
  }
}

/**
 * يعيد معرّف المستخدم إن طابقت كلمة المرور، وإلا null (نفس الرد لعدم الوجود ولخطأ كلمة المرور).
 * الحساب غير الموجود يُجري حساب bcrypt بنفس الكلفة أيضاً، فلا يكشف زمن الرد وجود الحساب.
 */
export async function verifyCredentials(
  identifier: Identifier,
  password: string,
  db: Db = dbFor(SERVICE),
): Promise<string | null> {
  const { email, phone } = identifierColumns(identifier);
  // تُحسب bcrypt دائماً: على تجزئة الحساب إن وُجد، وإلا على تجزئة وهمية بالكلفة نفسها
  const row = await db.one<{ id: string | null }>(
    `with candidate as (
       select id, encrypted_password from auth.users
       where ($1::text is not null and email = $1) or ($2::text is not null and phone = $2)
       limit 1
     )
     select case
              when c.encrypted_password = public.crypt($3, coalesce(c.encrypted_password, d.hash))
              then c.id
            end as id
     from (select public.gen_salt('bf', 10) as hash) d
     left join candidate c on true`,
    [email, phone, password],
  );
  if (!row.id) return null;
  await db.query("update auth.users set last_sign_in_at = now() where id = $1", [row.id]);
  return row.id;
}

/** يتحقق من كلمة المرور الحالية لمستخدم معروف (قبل تغيير بيانات الدخول) */
export async function verifyPasswordById(
  userId: string,
  password: string,
  db: Db = dbFor(SERVICE),
): Promise<boolean> {
  const row = await db.maybeOne<{ ok: boolean }>(
    "select encrypted_password = public.crypt($2, encrypted_password) as ok from auth.users where id = $1",
    [userId, password],
  );
  return Boolean(row?.ok);
}

/**
 * يغيّر كلمة المرور ويزيد إصدار الجلسات فتبطل كل الجلسات السابقة.
 * يعيد الإصدار الجديد ليُصدر المستدعي جلسة جديدة لهذا الجهاز.
 */
export async function changePassword(
  userId: string,
  newPassword: string,
  db: Db = dbFor(SERVICE),
): Promise<number> {
  const row = await db.one<{ session_version: number }>(
    `update auth.users
     set encrypted_password = public.crypt($2, public.gen_salt('bf', 10)),
         session_version = session_version + 1,
         updated_at = now()
     where id = $1
     returning session_version`,
    [userId, newPassword],
  );
  return row.session_version;
}

/** إصدار الجلسات الحالي للمستخدم (null إن حُذف الحساب) */
export async function sessionVersion(userId: string, db: Db = dbFor(SERVICE)) {
  const row = await db.maybeOne<{ session_version: number }>(
    "select session_version from auth.users where id = $1",
    [userId],
  );
  return row?.session_version ?? null;
}

/** يغيّر بريد الدخول (أو يضيفه لحساب مسجّل بالجوال)؛ exists إن كان مستخدماً لحساب آخر */
export async function changeEmail(
  userId: string,
  email: string,
  db: Db = dbFor(SERVICE),
): Promise<{ ok: true } | { ok: false; reason: "exists" }> {
  try {
    await db.query("update auth.users set email = $2, updated_at = now() where id = $1", [
      userId,
      email.toLowerCase(),
    ]);
    return { ok: true };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "exists" };
    throw error;
  }
}
