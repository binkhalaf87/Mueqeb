import "server-only";
import { dbFor, SERVICE } from "@/lib/db/core";

const PUBLIC_KEYS = [
  "client_fee_pct",
  "provider_commission_pct",
  "delivery_confirmation_days",
  "cancel_after_start_provider_pct",
  "offer_window_hours",
] as const;

type PublicKey = (typeof PUBLIC_KEYS)[number];

/** القيم الحالية لإعدادات تُذكر في السياسات العامة (قائمة محددة غير حساسة فقط) */
export async function publicPolicyValues(): Promise<Record<PublicKey, number>> {
  const rows = await dbFor(SERVICE).query<{ key: PublicKey; value: number }>(
    "select key, value from public.settings where key = any($1::text[])",
    [PUBLIC_KEYS],
  );
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)])) as Record<PublicKey, number>;
}
