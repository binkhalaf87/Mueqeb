/**
 * رموز روابط البريد ذات الاستخدام الواحد (استعادة كلمة المرور، تأكيد البريد).
 * الرمز الخام يُرسل في الرابط فقط؛ القاعدة تحفظ تجزئته (sha256)، فتسريب الجدول لا يكشف روابط صالحة.
 * الرمز يبطل بالاستخدام، أو بانتهاء المدة، أو بإصدار رمز أحدث للغرض نفسه، أو بتغيّر بريد الحساب.
 */
import { createHash, randomBytes } from "node:crypto";
import { dbFor, SERVICE, type Db } from "@/lib/db/core";

export type TokenPurpose = "password_reset" | "email_verify";

export const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = {
  password_reset: 60,
  email_verify: 60 * 24 * 3,
};

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** يصدر رمزاً جديداً ويُبطل الرموز السابقة غير المستخدمة للغرض نفسه */
export async function issueToken(
  userId: string,
  purpose: TokenPurpose,
  email: string,
  db: Db = dbFor(SERVICE),
) {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.query(
      `update auth.one_time_tokens set used_at = now()
       where user_id = $1 and purpose = $2 and used_at is null`,
      [userId, purpose],
    );
    await tx.query(
      `insert into auth.one_time_tokens (user_id, purpose, token_hash, email, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
      [userId, purpose, hashToken(token), email, TOKEN_TTL_MINUTES[purpose]],
    );
  });
  return token;
}

const VALID = `t.token_hash = $1 and t.purpose = $2 and t.used_at is null
               and t.expires_at > now() and u.email = t.email`;

/** هل الرمز صالح (دون استهلاكه) — لعرض نموذج كلمة المرور الجديدة */
export async function isTokenValid(token: string, purpose: TokenPurpose, db: Db = dbFor(SERVICE)) {
  if (!TOKEN_SHAPE.test(token)) return false;
  const row = await db.maybeOne(
    `select 1 from auth.one_time_tokens t join auth.users u on u.id = t.user_id where ${VALID}`,
    [hashToken(token), purpose],
  );
  return Boolean(row);
}

/** يستهلك الرمز مرة واحدة ويعيد صاحبه، أو null إن كان غير صالح */
export async function consumeToken(
  token: string,
  purpose: TokenPurpose,
  db: Db = dbFor(SERVICE),
): Promise<{ userId: string; email: string } | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const row = await db.maybeOne<{ user_id: string; email: string }>(
    `update auth.one_time_tokens t set used_at = now()
     from auth.users u
     where u.id = t.user_id and ${VALID}
     returning t.user_id, t.email`,
    [hashToken(token), purpose],
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}
