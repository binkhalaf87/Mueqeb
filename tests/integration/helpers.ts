import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
export const PASSWORD = "Mueqeb#2026";

export type Client = SupabaseClient<Database>;

export async function supabaseAvailable() {
  if (!url || !publishableKey || !secretKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: publishableKey } });
    return res.ok;
  } catch {
    return false;
  }
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function anonClient(): Client {
  return createClient<Database>(url, publishableKey, noSession);
}

export function serviceClient(): Client {
  return createClient<Database>(url, secretKey, noSession);
}

export async function signIn(identifier: { email: string } | { phone: string }): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ ...identifier, password: PASSWORD });
  if (error) throw error;
  return client;
}

/** ينشئ مستخدماً جديداً ويعيد عميلاً مسجّل الدخول به؛ cleanup يحذفه */
export async function createTestUser(admin: Client, created: string[]) {
  const email = `test-${randomUUID()}@mueqeb.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "مستخدم اختبار" },
  });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, client: await signIn({ email }) };
}
