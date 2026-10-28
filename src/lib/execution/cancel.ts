import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundAtGateway } from "@/lib/payments/process";
import type { FormState } from "@/app/actions/auth";

/**
 * الإلغاء بعد بدء التنفيذ: يُحتسب للمزوّد جزء من أتعابه (نسبة من الإعدادات)، ويُسترد الباقي للعميل
 * عبر البوابة، ثم تُسجّل التسوية في الدفتر وتُلغى الحالة في معاملة واحدة.
 * ليس Server Action: يُستدعى فقط من cancelRequest بعد التحقق من المستخدم.
 */
export async function cancelInProgress(requestId: string, actorId: string): Promise<FormState> {
  const supabase = await createClient();
  // بصلاحيات المستخدم: يُرجع null لغير أعضاء حساب الطلب
  const { data: refund, error } = await supabase.rpc("cancellation_after_start_refund", {
    p_request_id: requestId,
  });
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error || refund === null || !order) return { message: "الطلب غير متاح." };

  let refundRef: string | null;
  try {
    refundRef = await refundAtGateway(order.id, refund);
  } catch (err) {
    console.error("partial refund failed", err);
    return { message: "تعذّر الاسترداد من بوابة الدفع؛ لم يُلغَ الطلب. حاول لاحقاً." };
  }
  const { error: cancelError } = await createAdminClient().rpc("cancel_after_start", {
    p_request_id: requestId,
    p_refund_ref: refundRef ?? "",
    p_actor_id: actorId,
  });
  if (cancelError) {
    console.error("cancel after start failed after gateway refund", cancelError);
    return { message: "حدث خطأ بعد الاسترداد؛ أُبلغت الإدارة." };
  }
  revalidatePath("/dashboard/requester", "layout");
  revalidatePath("/dashboard/provider", "layout");
  return { message: "أُلغي الطلب، واستُرد لك ما يخصك من المبلغ." };
}
