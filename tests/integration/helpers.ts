import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { makeClient, signInAs, type Client } from "./client";

config({ path: ".env.local", quiet: true });

export const DB_URL = process.env.DATABASE_URL ?? "";
export const PASSWORD = "Mueqeb#2026";

export type { Client };

/** قاعدة البيانات المحلية متاحة (DATABASE_URL + الـ migrations مطبّقة) */
export async function databaseAvailable() {
  if (!DB_URL || !process.env.AUTH_SECRET) return false;
  const client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
    await client.query("select 1 from public.profiles limit 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function anonClient(): Client {
  return makeClient({ kind: "anon" });
}

export function serviceClient(): Client {
  return makeClient({ kind: "service" });
}

export async function signIn(identifier: { email: string } | { phone: string }): Promise<Client> {
  return signInAs(identifier, PASSWORD);
}

/** ينشئ مستخدماً جديداً ويعيد عميلاً بهويته؛ cleanup يحذفه */
export async function createTestUser(admin: Client, created: string[]) {
  const email = `test-${randomUUID()}@mueqeb.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    user_metadata: { full_name: "مستخدم اختبار" },
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
  created.push(data.user.id);
  return { id: data.user.id, client: await signIn({ email }) };
}
