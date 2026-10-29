/**
 * عميل اختبار بواجهة { data, error } مختصرة فوق طبقة قاعدة البيانات (src/lib/db/core).
 * كل استدعاء يعمل بهوية المنفّذ (anon / مستخدم / service) فتُختبر سياسات RLS والصلاحيات
 * كما يراها التطبيق تماماً. يدعم فقط ما تحتاجه الاختبارات: مرشحات بسيطة بلا تضمين جداول.
 */
import { dbFor, toDbError, type Actor, type DbError } from "@/lib/db/core";
import type { Database, FunctionArgs, FunctionName, FunctionReturns, Tables } from "@/lib/db/types";
import { createAccount, verifyCredentials } from "@/lib/auth/accounts";
import { createSignedUrls, readObject, removeObjects, uploadObject } from "@/lib/storage";

type Result<T> =
  | { data: T; error: null; count?: number | null }
  | { data: null; error: DbError; count?: number | null };

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string) {
  if (!IDENT.test(name)) throw new Error(`معرّف غير مدعوم في عميل الاختبار: ${name}`);
  return name;
}

function columnList(columns: string) {
  const trimmed = columns.trim();
  if (trimmed === "*" || trimmed === "") return "*";
  return trimmed
    .split(",")
    .map((c) => ident(c.trim()))
    .join(", ");
}

const NOT_ONE: DbError = {
  code: "PGRST116",
  message: "JSON object requested, multiple (or no) rows returned",
};

const jsonColumns = new Map<string, Set<string>>();

/** أعمدة json/jsonb للجدول (تُرسل كنص JSON لأن pg يحوّل المصفوفات إلى مصفوفات Postgres) */
async function jsonColumnsOf(table: string) {
  let cols = jsonColumns.get(table);
  if (!cols) {
    const rows = await dbFor({ kind: "service" }).query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 and data_type in ('json', 'jsonb')`,
      [table],
    );
    cols = new Set(rows.map((r) => r.column_name));
    jsonColumns.set(table, cols);
  }
  return cols;
}

type TableName = keyof Database["public"]["Tables"];

/** Row نوع الصف؛ Res شكل النتيجة: مصفوفة، أو صف (single)، أو صف/null (maybeSingle) */
class Query<Row, Res = Row[]> implements PromiseLike<Result<Res>> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private wantCount = false;
  private head = false;
  private filters: { sql: (i: number) => string; value?: unknown }[] = [];
  private orderBy: string[] = [];
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private values: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};

  constructor(
    private readonly actor: Actor,
    private readonly table: string,
  ) {
    ident(table);
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.op === "select") this.columns = columns;
    else this.returning = columns;
    this.wantCount = opts?.count === "exact";
    this.head = Boolean(opts?.head);
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.values = Array.isArray(values) ? values : [values];
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ sql: (i) => `${ident(column)} = $${i}`, value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ sql: (i) => `${ident(column)} is distinct from $${i}`, value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ sql: (i) => `${ident(column)} = any($${i})`, value: values });
    return this;
  }
  is(column: string, value: null | boolean) {
    const v = value === null ? "null" : value ? "true" : "false";
    this.filters.push({ sql: () => `${ident(column)} is ${v}` });
    return this;
  }
  filter(column: string, operator: string, value: unknown) {
    const ops: Record<string, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    };
    const sqlOp = ops[operator];
    if (!sqlOp) throw new Error(`مرشح غير مدعوم: ${operator}`);
    this.filters.push({ sql: (i) => `${ident(column)} ${sqlOp} $${i}`, value });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy.push(`${ident(column)} ${opts?.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this as unknown as Query<Row, Row>;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this as unknown as Query<Row, Row | null>;
  }

  private where(params: unknown[]) {
    if (!this.filters.length) return "";
    return (
      " where " +
      this.filters
        .map((f) => {
          if (f.value === undefined) return f.sql(0);
          params.push(f.value);
          return f.sql(params.length);
        })
        .join(" and ")
    );
  }

  private async encode(row: Record<string, unknown>) {
    const json = await jsonColumnsOf(this.table);
    return Object.entries(row).map(
      ([k, v]) => [ident(k), json.has(k) && v !== null ? JSON.stringify(v) : v] as const,
    );
  }

  private async execute(): Promise<Result<Res>> {
    type T = Res;
    const db = dbFor(this.actor);
    const table = `public.${this.table}`;
    const params: unknown[] = [];
    let sql: string;

    if (this.op === "select") {
      sql = `select ${columnList(this.columns)} from ${table}${this.where(params)}`;
      if (this.orderBy.length) sql += ` order by ${this.orderBy.join(", ")}`;
      if (this.limitN !== null) sql += ` limit ${Number(this.limitN)}`;
    } else if (this.op === "insert") {
      const rows = await Promise.all(this.values.map((v) => this.encode(v)));
      const cols = rows[0].map(([k]) => k);
      const tuples = rows.map(
        (r) =>
          `(${r
            .map(([, v]) => {
              params.push(v);
              return `$${params.length}`;
            })
            .join(", ")})`,
      );
      sql = `insert into ${table} (${cols.join(", ")}) values ${tuples.join(", ")}`;
      if (this.returning !== null) sql += ` returning ${columnList(this.returning)}`;
    } else if (this.op === "update") {
      const sets = (await this.encode(this.patch)).map(([k, v]) => {
        params.push(v);
        return `${k} = $${params.length}`;
      });
      sql = `update ${table} set ${sets.join(", ")}${this.where(params)}`;
      if (this.returning !== null) sql += ` returning ${columnList(this.returning)}`;
    } else {
      sql = `delete from ${table}${this.where(params)}`;
      if (this.returning !== null) sql += ` returning ${columnList(this.returning)}`;
    }

    try {
      let count: number | null = null;
      if (this.wantCount && this.op === "select") {
        const countParams: unknown[] = [];
        const row = await db.one<{ n: number }>(
          `select count(*) as n from ${table}${this.where(countParams)}`,
          countParams,
        );
        count = row.n;
        if (this.head) return { data: null as T, error: null, count };
      }
      const rows = await db.query<Record<string, unknown>>(sql, params);
      const returnsRows = this.op === "select" || this.returning !== null;
      if (!returnsRows) return { data: null as T, error: null, count };
      if (this.mode === "single") {
        return rows.length === 1
          ? { data: rows[0] as T, error: null, count }
          : { data: null, error: NOT_ONE, count };
      }
      if (this.mode === "maybe") {
        if (rows.length > 1) return { data: null, error: NOT_ONE, count };
        return { data: (rows[0] ?? null) as T, error: null, count };
      }
      return { data: rows as T, error: null, count };
    } catch (error) {
      return { data: null, error: toDbError(error), count: null };
    }
  }

  then<R1 = Result<Res>, R2 = never>(
    onfulfilled?: ((value: Result<Res>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/** نتيجة دالة مع .single() / .maybeSingle() لدوال الجداول */
function rpcCall<F extends FunctionName>(actor: Actor, name: F, args?: FunctionArgs<F>) {
  const run = () => dbFor(actor).rpc(name, args);
  const pick = (strict: boolean) =>
    run().then((r) => {
      if (r.error) return r;
      const rows = (Array.isArray(r.data) ? r.data : [r.data]) as unknown[];
      if (rows.length === 1) return { data: rows[0], error: null };
      if (!strict && rows.length === 0) return { data: null, error: null };
      return { data: null, error: NOT_ONE };
    });
  return Object.assign(run(), {
    single: () => pick(true) as Promise<Result<FunctionReturns<F> extends (infer E)[] ? E : never>>,
    maybeSingle: () =>
      pick(false) as Promise<Result<FunctionReturns<F> extends (infer E)[] ? E : never>>,
  });
}

function toBlob(body: Blob | Buffer | Uint8Array | string, contentType?: string) {
  if (body instanceof Blob) return body;
  return new Blob([body as BlobPart], { type: contentType ?? "application/octet-stream" });
}

export type Client = ReturnType<typeof makeClient>;

export function makeClient(actor: Actor) {
  const db = dbFor(actor);
  return {
    actor,
    from: <N extends TableName, Row = Tables<N>>(table: N) => new Query<Row>(actor, table),
    rpc: <F extends FunctionName>(name: F, args?: FunctionArgs<F>) => rpcCall(actor, name, args),
    storage: {
      from: (bucket: string) => ({
        upload: async (
          path: string,
          body: Blob | Buffer | Uint8Array | string,
          opts?: { contentType?: string },
        ) => {
          const { error } = await uploadObject(db, bucket, path, toBlob(body, opts?.contentType));
          return { data: error ? null : { path }, error: error ? { message: error } : null };
        },
        download: async (path: string) => {
          const urls = await createSignedUrls(db, bucket, [path], 60);
          if (!urls.has(path)) return { data: null, error: { message: "not found" } };
          return { data: new Blob([new Uint8Array(await readObject(bucket, path))]), error: null };
        },
        createSignedUrl: async (path: string, ttl: number) => {
          const urls = await createSignedUrls(db, bucket, [path], ttl);
          const signedUrl = urls.get(path);
          return signedUrl
            ? { data: { signedUrl }, error: null }
            : { data: null, error: { message: "not found" } };
        },
        /** ملفات مجلد (المرئية للمنفّذ فقط) */
        list: async (folder: string) => {
          const rows = await db.query<{ name: string }>(
            "select name from storage.objects where bucket_id = $1 and name like $2 order by name",
            [bucket, `${folder.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`],
          );
          return {
            data: rows.map((r) => ({ name: r.name.slice(folder.length + 1) })),
            error: null,
          };
        },
        remove: async (paths: string[]) => {
          await removeObjects(db, bucket, paths);
          return { data: paths, error: null };
        },
      }),
    },
    auth: {
      getUser: async () => ({
        data: { user: actor.kind === "user" ? { id: actor.id } : null },
        error: null,
      }),
      admin: {
        createUser: async (opts: {
          email?: string;
          phone?: string;
          password: string;
          user_metadata?: { full_name?: string };
        }) => {
          const identifier = opts.email
            ? ({ kind: "email", email: opts.email } as const)
            : ({ kind: "phone", phone: opts.phone! } as const);
          const result = await createAccount(
            identifier,
            opts.password,
            opts.user_metadata?.full_name ?? "",
          );
          return result.ok
            ? { data: { user: { id: result.userId } }, error: null }
            : { data: { user: null }, error: { message: result.reason } };
        },
        deleteUser: async (id: string) => {
          try {
            await dbFor({ kind: "service" }).query("delete from auth.users where id = $1", [id]);
            return { error: null };
          } catch (error) {
            return { error: toDbError(error) };
          }
        },
      },
    },
  };
}

/** يتحقق من كلمة المرور ويعيد عميلاً بهوية المستخدم */
export async function signInAs(
  identifier: { email: string } | { phone: string },
  password: string,
): Promise<Client> {
  const id = await verifyCredentials(
    "email" in identifier
      ? { kind: "email", email: identifier.email }
      : { kind: "phone", phone: identifier.phone },
    password,
  );
  if (!id) throw new Error(`invalid credentials for ${JSON.stringify(identifier)}`);
  return makeClient({ kind: "user", id });
}
