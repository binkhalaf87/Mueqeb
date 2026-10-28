import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * عميل بمفتاح الخدمة — للعمليات المالية التي لا ينفّذها المستخدم مباشرة
 * (تسجيل محاولات الدفع، نتائج البوابة، الاسترداد). لا يُستورد في مكوّنات العميل.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY مطلوب للعمليات المالية");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
