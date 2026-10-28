"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/auth/validation";
import { reviewSchema } from "@/lib/providers/validation";
import type { FormState } from "./auth";

const DONE: Record<string, string> = {
  approve: "اعتُمد المزوّد.",
  reject: "رُفض الطلب.",
  suspend: "أُوقف المزوّد.",
};

export async function reviewProvider(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = reviewSchema.safeParse({
    providerId: formData.get("providerId"),
    action: formData.get("action"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { providerId, action, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_provider", {
    p_provider_id: providerId,
    p_action: action,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes("invalid_status")) {
      return { message: "لا يمكن تنفيذ هذا الإجراء في حالة المزوّد الحالية." };
    }
    return { message: "تعذّر تنفيذ الإجراء، حاول مرة أخرى." };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/providers", "layout");
  revalidatePath("/dashboard/provider", "layout");
  return { message: DONE[action] };
}
