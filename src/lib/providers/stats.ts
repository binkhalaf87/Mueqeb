import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ProviderStats = Database["public"]["Functions"]["provider_stats"]["Returns"][number];

/** إحصاءات مجموعة مزوّدين دفعة واحدة */
export async function getProviderStats(ids: string[]) {
  if (ids.length === 0) return new Map<string, ProviderStats>();
  const supabase = await createClient();
  const { data } = await supabase.rpc("provider_stats", { p_provider_ids: ids });
  return new Map((data ?? []).map((s) => [s.provider_id, s]));
}
