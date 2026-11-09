/**
 * تنظيف قاعدة الإنتاج قبل الإطلاق (مرة واحدة): يحذف كل البيانات التشغيلية والحسابات،
 * ويُبقي حساباً واحداً يصبح المدير الوحيد، والبيانات المرجعية (الكتالوج، الإعدادات، إرشادات التفويض).
 *
 * التشغيل: PRODUCTION_RESET_KEEP_EMAIL=<email> npm run prod:reset
 * على Railway يعمل عند البدء إن وُجد المتغير، ولا يتكرر: يُسجَّل في migrations.applied.
 *
 * الأمان:
 *  - كل التغييرات في قاعدة البيانات في معاملة واحدة: تنجح كلها أو لا يتغير شيء.
 *  - قبل الحذف تُنسخ كل الجداول إلى مخطط backup_reset_<التاريخ> (مغلق، RLS بلا سياسات).
 *  - لا يبدأ إن لم يوجد الحساب المطلوب الإبقاء عليه.
 *  - ملفات المستندات تُنقل (لا تُحذف) إلى مجلد _backup_reset_<التاريخ> داخل STORAGE_DIR.
 *  - التتابع (append-only) للدفتر وسجل التدقيق يُعطَّل مؤقتاً داخل المعاملة فقط، لهذا التنظيف وحده.
 */
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

/** جداول تبقى كما هي (بيانات مرجعية) */
const KEEP = new Set([
  "public.service_categories",
  "public.service_types",
  "public.settings",
  "public.delegation_guides",
  "storage.buckets",
]);
/** تُعالج بحذف الحسابات لا بالتفريغ */
const USERS = new Set(["public.profiles", "auth.users"]);

const keepEmail = process.env.PRODUCTION_RESET_KEEP_EMAIL?.trim().toLowerCase();
const url = process.env.DATABASE_URL;

async function main() {
  if (!keepEmail) {
    console.log("prod:reset — PRODUCTION_RESET_KEEP_EMAIL غير مضبوط، لا شيء للتنفيذ.");
    return;
  }
  if (!url) throw new Error("DATABASE_URL مطلوب");
  const marker = `reset:${keepEmail}`;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const backupSchema = `backup_reset_${stamp}`;

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const done = await client.query("select 1 from migrations.applied where version = $1", [
      marker,
    ]);
    if (done.rowCount) {
      console.log("prod:reset — نُفّذ سابقاً لهذا الحساب، لا تكرار.");
      return;
    }

    await client.query("begin");
    const keeper = await client.query<{ id: string }>(
      "select id from auth.users where lower(email) = $1",
      [keepEmail],
    );
    if (keeper.rowCount !== 1) {
      throw new Error(`الحساب ${keepEmail} غير موجود؛ لم يتغير شيء`);
    }
    const keeperId = keeper.rows[0].id;

    const { rows: tables } = await client.query<{ name: string }>(
      `select format('%I.%I', n.nspname, c.relname) as name
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname in ('public', 'storage', 'auth')
       order by 1`,
    );

    // 1) نسخة احتياطية داخل القاعدة
    await client.query(`create schema ${backupSchema}`);
    await client.query(`revoke all on schema ${backupSchema} from public`);
    for (const { name } of tables) {
      const target = `${backupSchema}.${name.replace(".", "__")}`;
      await client.query(`create table ${target} as table ${name}`);
      await client.query(`alter table ${target} enable row level security`);
    }

    // 2) تعطيل triggers المستخدم (append-only، التدقيق، الإشعارات) داخل هذه المعاملة فقط
    for (const { name } of tables) {
      await client.query(`alter table ${name} disable trigger user`);
    }

    // 3) تفريغ البيانات التشغيلية في أمر واحد (بلا CASCADE: يفشل إن أشار إليها جدول محفوظ)
    const wipe = tables.map((t) => t.name).filter((n) => !KEEP.has(n) && !USERS.has(n));
    await client.query(`truncate ${wipe.join(", ")} restart identity`);

    // 4) الحسابات: يبقى حساب واحد يصبح المدير الوحيد
    const deleted = await client.query("delete from auth.users where id <> $1", [keeperId]);
    await client.query(
      `update public.profiles
       set role = 'admin', suspended_at = null, suspension_reason = null
       where id = $1`,
      [keeperId],
    );
    await client.query(
      `update auth.users
       set email_verified_at = coalesce(email_verified_at, now()),
           session_version = session_version + 1
       where id = $1`,
      [keeperId],
    );

    for (const { name } of tables) {
      await client.query(`alter table ${name} enable trigger user`);
    }
    await client.query("insert into migrations.applied (version) values ($1)", [marker]);
    await client.query("commit");

    console.log(
      `prod:reset — ✓ فُرّغ ${wipe.length} جدولاً، وحُذف ${deleted.rowCount} حساباً، ` +
        `وبقي ${keepEmail} مديراً وحيداً. النسخة الاحتياطية: ${backupSchema}`,
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  // 5) ملفات المستندات: نقلها إلى مجلد احتياطي (لا حذف)
  const root = path.resolve(process.env.STORAGE_DIR ?? ".data/storage");
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const buckets = entries.filter((e) => e.isDirectory() && !e.name.startsWith("_backup"));
  if (buckets.length) {
    const backupDir = path.join(root, `_backup_reset_${stamp}`);
    await mkdir(backupDir, { recursive: true });
    for (const bucket of buckets) {
      await rename(path.join(root, bucket.name), path.join(backupDir, bucket.name));
    }
    console.log(`prod:reset — نُقلت ملفات ${buckets.length} مجلد إلى ${backupDir}`);
  }
}

main().catch((error) => {
  console.error(`prod:reset — ✗ ${(error as Error).message}`);
  process.exitCode = 1;
});
