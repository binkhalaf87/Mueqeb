"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  // رسالة أوضح للحد الأدنى قبل الوصول للقاعدة (القاعدة تتحقق أيضاً)
  const { data: request } = await supabase
    .from("service_requests")
    .select("service_types(min_fee_halalas)")
    .eq("id", input.requestId)
    .maybeSingle();
  const minFee = request?.service_types?.min_fee_halalas;
  if (minFee && input.fee < minFee) {
    return { errors: { fee: `الحد الأدنى لأتعاب هذه الخدمة ${formatHalalas(minFee)}` } };
  }

  const { error } = await supabase.rpc("submit_bid", {
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
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_bid", {
    p_bid_id: String(formData.get("bidId") ?? ""),
  });
  if (error) return { message: rpcErrorMessage(error) };
  revalidatePath("/dashboard/provider", "layout");
  revalidatePath("/dashboard/requester", "layout");
  return { message: "سُحب عرضك." };
}
