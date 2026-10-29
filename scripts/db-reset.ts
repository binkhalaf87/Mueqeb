/**
 * يحذف قاعدة البيانات المحلية ويعيد إنشاءها ثم يطبّق كل الـ migrations.
 * للتطوير المحلي فقط: يرفض أي DATABASE_URL غير localhost.
 */
import { config } from "dotenv";
import pg from "pg";
import { migrate } from "../db/migrator";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL مطلوب");
  process.exit(1);
}
const target = new URL(url);
if (!["localhost", "127.0.0.1"].includes(target.hostname)) {
  console.error(`رفض إعادة تهيئة ${target.hostname}: السكربت للبيئة المحلية فقط.`);
  process.exit(1);
}

const dbName = target.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) {
  console.error(`اسم قاعدة غير صالح: ${dbName}`);
  process.exit(1);
}
const admin = new URL(url);
admin.pathname = "/postgres";

async function main() {
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [dbName],
  );
  await client.query(`drop database if exists ${dbName}`);
  await client.query(`create database ${dbName}`);
  await client.end();
  console.log(`أُعيد إنشاء ${dbName}`);

  await migrate(url!);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
