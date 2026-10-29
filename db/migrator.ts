/** يطبّق ملفات db/migrations بالترتيب، كل ملف في معاملة واحدة، ويسجّل ما طُبّق. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const DIR = path.join(process.cwd(), "db", "migrations");

export async function migrate(databaseUrl: string, log = console.log) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      create schema if not exists migrations;
      create table if not exists migrations.applied (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    // قفل يمنع تشغيلين متزامنين (نشران متتاليان مثلاً)
    await client.query("select pg_advisory_lock(hashtext('mueqeb_migrations'))");

    const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ version: string }>(
      "select version from migrations.applied",
    );
    const applied = new Set(rows.map((r) => r.version));

    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      const sql = await readFile(path.join(DIR, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into migrations.applied (version) values ($1)", [version]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`فشل ${file}: ${(error as Error).message}`, { cause: error });
      }
      log(`✓ ${file}`);
      count++;
    }
    log(count ? `طُبّق ${count} migration` : "قاعدة البيانات محدّثة");
  } finally {
    await client.end();
  }
}
