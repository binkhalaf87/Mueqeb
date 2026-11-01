/**
 * ينشئ حساب مدير المنصة الحقيقي (مرة واحدة) من متغيرات البيئة:
 *   ADMIN_BOOTSTRAP_EMAIL، ADMIN_BOOTSTRAP_PASSWORD (12 حرفاً على الأقل)، ADMIN_BOOTSTRAP_NAME (اختياري)
 *
 * يعمل محلياً بـ `npm run admin:create`، وعلى Railway تلقائياً عند البدء إن وُجدت المتغيرات.
 * آمن للتكرار: لا يغيّر كلمة مرور حساب موجود أبداً. حساب موجود بالبريد نفسه يُرقّى لمدير فقط
 * مع ADMIN_BOOTSTRAP_PROMOTE_EXISTING=1. احذف المتغيرات من Railway بعد أول تشغيل ناجح.
 */
import { config } from "dotenv";
import { closePools, dbFor, SERVICE } from "../src/lib/db/core";
import { createAccount } from "../src/lib/auth/accounts";

config({ path: ".env.local", quiet: true });

const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "إدارة المنصة";

async function main() {
  if (!email) {
    console.log("admin:create — ADMIN_BOOTSTRAP_EMAIL غير مضبوط، لا شيء للتنفيذ.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_BOOTSTRAP_EMAIL غير صحيح");

  const service = dbFor(SERVICE);
  const existing = await service.maybeOne<{ id: string; role: string | null }>(
    `select u.id, p.role from auth.users u left join public.profiles p on p.id = u.id
     where u.email = $1`,
    [email],
  );

  let userId: string;
  if (existing) {
    if (existing.role === "admin") {
      console.log("admin:create — الحساب مدير مسبقاً، لا تغيير.");
      return;
    }
    if (process.env.ADMIN_BOOTSTRAP_PROMOTE_EXISTING !== "1") {
      throw new Error(
        "يوجد حساب بهذا البريد وليس مديراً. للترقية اضبط ADMIN_BOOTSTRAP_PROMOTE_EXISTING=1.",
      );
    }
    userId = existing.id;
  } else {
    if (password.length < 12) throw new Error("ADMIN_BOOTSTRAP_PASSWORD: 12 حرفاً على الأقل");
    const created = await createAccount({ kind: "email", email }, password, name, service);
    if (!created.ok) throw new Error(`تعذّر إنشاء الحساب: ${created.reason}`);
    userId = created.userId;
  }

  await service.query(
    "update auth.users set email_verified_at = coalesce(email_verified_at, now()) where id = $1",
    [userId],
  );
  await service.query("update public.profiles set role = 'admin' where id = $1", [userId]);
  console.log(`admin:create — ✓ ${existing ? "رُقّي" : "أُنشئ"} حساب الإدارة.`);
}

main()
  .catch((error) => {
    console.error(`admin:create — ✗ ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closePools());
