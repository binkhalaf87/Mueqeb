"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import { fieldErrors } from "@/lib/auth/validation";
import { formatHalalas } from "@/lib/money";
import { rpcErrorMessage } from "@/lib/requests/constants";
import { bidSchema } from "@/lib/requests/validation";
import type { FormState } from "./auth";

export async function submitBid(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("provider");
  const parsed = bidSchema.safeParse({
    requestId: formData.get("requestId"),
    fee: formData.get("fee") ?? "",
    govFees: formData.get("govFees") ?? "",
    durationDays: formData.get("durationDays") ?? "",
    includes: formData.get("includes") ?? "",
    needsFromClient: formData.get("needsFromClient") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const db = await getDb();

  // رسالة أوضح للحد الأدنى قبل الوصول للقاعدة (القاعدة تتحقق أيضاً)
  const request = await db.maybeOne<{ min_fee_halalas: number }>(
    `select t.min_fee_halalas
     from public.service_requests r join public.service_types t on t.id = r.service_type_id
     where r.id = $1`,
    [input.requestId],
  );
  const minFee = request?.min_fee_halalas;
  if (minFee && input.fee < minFee) {
    return { errors: { fee: `الحد الأدنى لأتعاب هذه الخدمة ${formatHalalas(minFee)}` } };
  }

  const { error } = await db.rpc("submit_bid", {
    p_request_id: input.requestId,
    p_fee_halalas: input.fee,
    p_expected_gov_fees_halalas: input.govFees,
    p_duration_days: input.durationDays,
    p_includes: input.includes,
    p_needs_from_client: input.needsFromClient,
  });
  if (error) return { message: rpcErrorMessage(error) };

  revalidatePath("/dashboard/provider", "layout");
  revalidatePath("/dashboard/requester", "layout");
  return { message: "حُفظ عرضك." };
}

export async function withdrawBid(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("provider");
  const db = await getDb();
  const { error } = await db.rpc("withdraw_bid", {
    p_bid_id: String(formData.get("bidId") ?? ""),
  });
  if (error) return { message: rpcErrorMessage(error) };
  revalidatePath("/dashboard/provider", "layout");
  revalidatePath("/dashboard/requester", "layout");
  return { message: "سُحب عرضك." };
}
