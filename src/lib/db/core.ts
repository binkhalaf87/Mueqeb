/**
 * طبقة الوصول لقاعدة البيانات (Postgres عادي عبر pg).
 *
 * كل استعلام يعمل في معاملة بهوية منفّذ صريحة:
 *   - user:    SET LOCAL ROLE authenticated + claims فيها sub، فتطبّق سياسات RLS كما هي
 *   - anon:    زائر غير مسجّل
 *   - service: الخادم نفسه (يتجاوز RLS) — للعمليات المالية والإدارية الداخلية فقط
 *
 * لا يستورد server-only لأن السكربتات والاختبارات تستخدمه؛ الصفحات تستخدم src/lib/db/server.ts.
 */
import pg from "pg";
import type { FunctionArgs, FunctionName, FunctionReturns } from "@/lib/db/types";

// pg يعيد bigint/numeric كنصوص والتواريخ ككائنات Date؛ نوحّدها كما يتوقعها التطبيق
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
const isoTimestamp = (v: string) => v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, isoTimestamp);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => v.replace(" ", "T"));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Actor = { kind: "anon" } | { kind: "user"; id: string } | { kind: "service" };

export const ANON: Actor = { kind: "anon" };
export const SERVICE: Actor = { kind: "service" };
export const asUser = (id: string): Actor => ({ kind: "user", id });

/** خطأ قاعدة البيانات بالشكل الذي تفحصه الواجهة (code لـ SQLSTATE وmessage للنص) */
export type DbError = { code: string; message: string; details?: string; hint?: string };

export type RpcResult<T> = { data: T; error: null } | { data: null; error: DbError };

type Pool = pg.Pool;

const globalPools = globalThis as unknown as { __mueqebPools?: Map<string, Pool> };

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL مطلوب. انظر .env.local.example");
  return url;
}

function getPool(url = databaseUrl()): Pool {
  globalPools.__mueqebPools ??= new Map();
  let pool = globalPools.__mueqebPools.get(url);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: sslFor(url),
    });
    globalPools.__mueqebPools.set(url, pool);
  }
  return pool;
}

/** Railway الداخلي (*.railway.internal) ومحلياً بلا TLS؛ الاتصال العام عبر TLS */
function sslFor(url: string) {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".railway.internal")) {
    return undefined;
  }
  return { rejectUnauthorized: false };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionSetup(actor: Actor) {
  switch (actor.kind) {
    case "service":
      return `set local role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
    case "anon":
      return `set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
    case "user":
      if (!UUID.test(actor.id)) throw new Error("معرّف مستخدم غير صالح");
      return `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${actor.id}","role":"authenticated"}', true)`;
  }
}

export function toDbError(error: unknown): DbError {
  const e = error as pg.DatabaseError;
  return {
    code: e.code ?? "unknown",
    message: e.message ?? String(error),
    details: e.detail,
    hint: e.hint,
  };
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

type FnShape = { retset: boolean; composite: boolean; json_args: string[] };
const fnShapes = new Map<string, FnShape>();

/** عميل مرتبط بمعاملة واحدة مفتوحة بهوية المنفّذ */
export class Tx {
  constructor(private readonly client: pg.PoolClient) {}

  async query<T extends object = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.client.query(sql, params);
    return result.rows as T[];
  }

  async one<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const rows = await this.query<T>(sql, params);
    if (rows.length !== 1) throw new Error(`متوقع صف واحد، وُجد ${rows.length}`);
    return rows[0];
  }

  async maybeOne<T extends object = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * استدعاء دالة public.<name> بوسائط مسمّاة. النتيجة:
   * دالة setof/table → مصفوفة صفوف، دالة تُرجع صفاً مركّباً → كائن، غير ذلك → القيمة.
   */
  async rpcOrThrow<F extends FunctionName>(
    name: F,
    fnArgs?: FunctionArgs<F>,
  ): Promise<FunctionReturns<F>> {
    type T = FunctionReturns<F>;
    if (!IDENT.test(name)) throw new Error(`اسم دالة غير صالح: ${name}`);
    const args = (fnArgs ?? {}) as Record<string, unknown>;
    const keys = Object.keys(args).filter((k) => args[k] !== undefined);
    for (const k of keys) if (!IDENT.test(k)) throw new Error(`اسم وسيط غير صالح: ${k}`);
    const shape = await this.fnShape(name);
    const call = `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    // وسائط json/jsonb تُرسل كنص JSON (pg يحوّل المصفوفات إلى مصفوفات Postgres لا JSON)
    const params = keys.map((k) =>
      shape.json_args.includes(k) ? JSON.stringify(args[k]) : args[k],
    );
    if (shape.retset) return (await this.query(`select * from ${call}`, params)) as T;
    if (shape.composite)
      return ((await this.query(`select * from ${call}`, params))[0] ?? null) as T;
    const rows = await this.query<{ value: T }>(`select ${call} as value`, params);
    return rows[0]?.value as T;
  }

  private async fnShape(name: string): Promise<FnShape> {
    const cached = fnShapes.get(name);
    if (cached) return cached;
    const row = await this.maybeOne<FnShape>(
      `select p.proretset as retset, t.typtype = 'c' as composite,
              coalesce(array(
                select n from unnest(p.proargnames, p.proargtypes::oid[]) as a(n, ty)
                where ty in ('json'::regtype, 'jsonb'::regtype)
              ), '{}') as json_args
       from pg_proc p join pg_type t on t.oid = p.prorettype
       where p.pronamespace = 'public'::regnamespace and p.proname = $1
       limit 1`,
      [name],
    );
    if (!row) throw Object.assign(new Error(`الدالة غير موجودة: ${name}`), { code: "42883" });
    fnShapes.set(name, row);
    return row;
  }
}

/** ينفّذ fn داخل معاملة واحدة بهوية المنفّذ؛ أي خطأ يُلغي المعاملة كاملة */
export async function withActor<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
  url?: string,
): Promise<T> {
  const client = await getPool(url).connect();
  try {
    await client.query(`begin; ${sessionSetup(actor)}`);
    const result = await fn(new Tx(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** واجهة مختصرة: كل استدعاء في معاملته الخاصة */
export function dbFor(actor: Actor, url?: string) {
  return {
    actor,
    query: <T extends object = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      withActor(actor, (tx) => tx.query<T>(sql, params), url),
    one: <T extends object = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      withActor(actor, (tx) => tx.one<T>(sql, params), url),
    /** صف أو null؛ المعرّف غير الصالح (22P02، مثل uuid مشوّه من رابط) يُعامل كغير موجود */
    maybeOne: async <T extends object = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<T | null> => {
      try {
        return await withActor(actor, (tx) => tx.maybeOne<T>(sql, params), url);
      } catch (error) {
        if ((error as { code?: string }).code === "22P02") return null;
        throw error;
      }
    },
    /** استدعاء دالة مع إعادة الخطأ كقيمة (للأخطاء المتوقعة من قواعد العمل) */
    rpc: async <F extends FunctionName>(
      name: F,
      args?: FunctionArgs<F>,
    ): Promise<RpcResult<FunctionReturns<F>>> => {
      try {
        const data = await withActor(actor, (tx) => tx.rpcOrThrow(name, args), url);
        return { data, error: null };
      } catch (error) {
        return { data: null, error: toDbError(error) };
      }
    },
    transaction: <T>(fn: (tx: Tx) => Promise<T>) => withActor(actor, fn, url),
  };
}

export type Db = ReturnType<typeof dbFor>;

export async function closePools() {
  const pools = globalPools.__mueqebPools;
  if (!pools) return;
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}

/** يحوّل خطأ قاعدة البيانات المرمي إلى قيمة { data, error } لمعالجة أخطاء قواعد العمل */
export async function attempt<T>(promise: Promise<T>): Promise<RpcResult<T>> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    return { data: null, error: toDbError(error) };
  }
}
