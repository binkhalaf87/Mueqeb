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

/** يعيد معرّف المستخدم إن طابقت كلمة المرور، وإلا null (نفس الرد لعدم الوجود ولخطأ كلمة المرور) */
export async function verifyCredentials(
  identifier: Identifier,
  password: string,
  db: Db = dbFor(SERVICE),
): Promise<string | null> {
  const { email, phone } = identifierColumns(identifier);
  const row = await db.maybeOne<{ id: string }>(
    `update auth.users
     set last_sign_in_at = now()
     where (($1::text is not null and email = $1) or ($2::text is not null and phone = $2))
       and encrypted_password = public.crypt($3, encrypted_password)
     returning id`,
    [email, phone, password],
  );
  return row?.id ?? null;
}
