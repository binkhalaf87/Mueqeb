import "server-only";
import { getDb } from "@/lib/db/server";
import type { FunctionReturns } from "@/lib/db/types";

export type ProviderStats = FunctionReturns<"provider_stats">[number];

/** إحصاءات مجموعة مزوّدين دفعة واحدة */
export async function getProviderStats(ids: string[]) {
  if (ids.length === 0) return new Map<string, ProviderStats>();
  const db = await getDb();
  const { data } = await db.rpc("provider_stats", { p_provider_ids: ids });
  return new Map((data ?? []).map((s) => [s.provider_id, s]));
}
