/**
 * يولّد src/lib/db/types.ts من مخطط public في قاعدة البيانات (الجداول، الأنواع، الدوال).
 * التشغيل: npm run db:types (بعد أي migration)
 */
import { writeFile } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const OUT = "src/lib/db/types.ts";

type Column = { name: string; type: string; nullable: boolean };

const SCALARS: Record<string, string> = {
  uuid: "string",
  text: "string",
  varchar: "string",
  bpchar: "string",
  citext: "string",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  bool: "boolean",
  json: "Json",
  jsonb: "Json",
  timestamptz: "string",
  timestamp: "string",
  date: "string",
  time: "string",
  interval: "string",
  inet: "string",
  bytea: "string",
  void: "undefined",
  record: "Json",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL مطلوب");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const enums = new Map<string, string[]>();
  for (const row of (
    await client.query<{ name: string; labels: string[] }>(
      `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder)::text[] as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid
       where t.typnamespace = 'public'::regnamespace
       group by t.typname order by t.typname`,
    )
  ).rows) {
    enums.set(row.name, row.labels);
  }

  const tables = new Map<string, Column[]>();
  for (const row of (
    await client.query<{ table: string; column: string; type: string; nullable: boolean }>(
      `select c.relname as table, a.attname as column,
              format_type(a.atttypid, null) as type, not a.attnotnull as nullable
       from pg_class c
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p')
       order by c.relname, a.attnum`,
    )
  ).rows) {
    const columns = tables.get(row.table) ?? [];
    columns.push({ name: row.column, type: row.type, nullable: row.nullable });
    tables.set(row.table, columns);
  }

  const toTs = (pgType: string): string => {
    if (pgType.endsWith("[]")) return `${toTs(pgType.slice(0, -2))}[]`;
    const bare = pgType.replace(/^public\./, "").replace(/^"|"$/g, "");
    if (enums.has(bare)) return `Database["public"]["Enums"]["${bare}"]`;
    if (tables.has(bare)) return `Database["public"]["Tables"]["${bare}"]["Row"]`;
    const base = bare.replace(/\(.*\)$/, "");
    const aliases: Record<string, string> = {
      "timestamp with time zone": "timestamptz",
      "timestamp without time zone": "timestamp",
      "character varying": "varchar",
      character: "bpchar",
      boolean: "bool",
      integer: "int4",
      bigint: "int8",
      smallint: "int2",
      "double precision": "float8",
      real: "float4",
    };
    return SCALARS[aliases[base] ?? base] ?? "unknown";
  };

  const functions = (
    await client.query<{
      name: string;
      arg_names: string[] | null;
      arg_types: string[];
      arg_modes: string[] | null;
      n_defaults: number;
      retset: boolean;
      result: string;
      ret_type: string;
      ret_kind: string;
    }>(
      `select p.proname as name, p.proargnames as arg_names,
              array(select format_type(t, null) from unnest(p.proargtypes) t) as arg_types,
              p.proargmodes::text[] as arg_modes, p.pronargdefaults as n_defaults,
              p.proretset as retset, pg_get_function_result(p.oid) as result,
              format_type(p.prorettype, null) as ret_type, rt.typtype as ret_kind
       from pg_proc p join pg_type rt on rt.oid = p.prorettype
       where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
         and rt.typname not in ('trigger', 'event_trigger')
         and not exists (select 1 from pg_depend d
                         where d.objid = p.oid and d.deptype = 'e')
       order by p.proname`,
    )
  ).rows;

  const fnLines: string[] = [];
  for (const fn of functions) {
    const names = fn.arg_names ?? [];
    const modes = fn.arg_modes ?? names.map(() => "i");
    const inNames = names.filter((_, i) => modes[i] === "i" || modes[i] === "b");
    const firstDefault = inNames.length - fn.n_defaults;
    const args = inNames
      .map((n, i) => `${n}${i >= firstDefault ? "?" : ""}: ${toTs(fn.arg_types[i])}`)
      .join("; ");

    let returns: string;
    const table = /^TABLE\(([\s\S]*)\)$/.exec(fn.result);
    if (table) {
      const outNames = names.filter((_, i) => modes[i] === "t");
      const outTypes = splitTopLevel(table[1]).map((part) => part.replace(/^\S+\s+/, ""));
      const fields = outNames.map((n, i) => `${n}: ${toTs(outTypes[i])}`).join("; ");
      returns = `{ ${fields} }[]`;
    } else {
      const single = toTs(fn.ret_type);
      returns = fn.retset ? `${single}[]` : single;
    }
    const argsType = args ? `{ ${args} }` : "Record<string, never>";
    fnLines.push(`      ${fn.name}: { Args: ${argsType}; Returns: ${returns} };`);
  }

  const out = `// مولَّد بواسطة scripts/gen-types.ts — لا تعدّله يدوياً (npm run db:types)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${[...tables]
  .map(
    ([name, cols]) =>
      `      ${name}: {\n        Row: {\n${cols
        .map((c) => `          ${c.name}: ${toTs(c.type)}${c.nullable ? " | null" : ""};`)
        .join("\n")}\n        };\n      };`,
  )
  .join("\n")}
    };
    Enums: {
${[...enums].map(([name, labels]) => `      ${name}: ${labels.map((l) => JSON.stringify(l)).join(" | ")};`).join("\n")}
    };
    Functions: {
${fnLines.join("\n")}
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
export type FunctionName = keyof Database["public"]["Functions"];
export type FunctionArgs<F extends FunctionName> = Database["public"]["Functions"][F]["Args"];
export type FunctionReturns<F extends FunctionName> = Database["public"]["Functions"][F]["Returns"];
`;
  await writeFile(OUT, out);
  await client.end();
  console.log(`✓ ${OUT}: ${tables.size} جدول، ${enums.size} نوع، ${functions.length} دالة`);
}

/** يقسم "a int, b numeric(10,2)" عند الفواصل خارج الأقواس */
function splitTopLevel(text: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
