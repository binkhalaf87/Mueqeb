import "server-only";
import { getDb } from "@/lib/db/server";

export type AdminKpis = {
  requests_published: number;
  requests_completed: number;
  requests_disputed: number;
  disputes_open: number;
  revenue_halalas: number;
  revenue_client_fee_halalas: number;
  escrow_halalas: number;
  payables_halalas: number;
  paid_out_halalas: number;
  repeat_establishments: number;
  active_establishments: number;
  repeat_rate_pct: number | null;
};

/** مؤشرات اللوحة — الأرقام المالية محسوبة في قاعدة البيانات من قيود الدفتر مباشرة */
export async function getAdminKpis(): Promise<AdminKpis> {
  const db = await getDb();
  const { data, error } = await db.rpc("admin_kpis");
  if (error) throw error;
  return data as unknown as AdminKpis;
}
