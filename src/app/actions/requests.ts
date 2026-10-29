"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import { refundPayment } from "@/lib/payments/process";
import { cancelInProgress } from "@/lib/execution/cancel";
import { fieldErrors } from "@/lib/auth/validation";
import { rpcErrorMessage } from "@/lib/requests/constants";
import { createRequestSchema } from "@/lib/requests/validation";
import type { FormState } from "./auth";

function revalidateRequestPages() {
  revalidatePath("/dashboard/requester", "layout");
  revalidatePath("/dashboard/provider", "layout");
}

export async function createRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const parsed = createRequestSchema.safeParse({
    mode: formData.get("mode"),
    accountId: formData.get("accountId"),
    serviceTypeId: formData.get("serviceTypeId"),
    providerId: formData.get("providerId") || undefined,
    city: formData.get("city") ?? "",
    urgency: formData.get("urgency") ?? "normal",
    description: formData.get("description") ?? "",
    availableDocs: formData.getAll("availableDocs"),
    privateNotes: formData.get("privateNotes") ?? undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const db = await getDb();
  const { data: requestId, error } = await db.rpc("create_service_request", {
    p_requester_account_id: input.accountId,
    p_service_type_id: input.serviceTypeId,
    p_mode: input.mode,
    p_target_provider_id: input.mode === "public" ? undefined : input.providerId,
    p_city: input.city,
    p_urgency: input.urgency,
    p_description: input.description,
    p_available_docs: input.availableDocs,
    p_private_notes: input.privateNotes,
  });
  if (error || !requestId) {
    return {
      message: rpcErrorMessage(error ?? { message: "" }, "تعذّر إنشاء الطلب، حاول مرة أخرى."),
    };
  }

  revalidateRequestPages();
  redirect(`/dashboard/requester/requests/${requestId}`);
}

export async function acceptBid(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const bidId = String(formData.get("bidId") ?? "");
  const db = await getDb();
  const { error } = await db.rpc("accept_bid", { p_bid_id: bidId });
  if (error) return { message: rpcErrorMessage(error) };
  revalidateRequestPages();
  return { message: "تم اختيار العرض. الخطوة التالية: الدفع." };
}

export async function cancelRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("requester");
  const requestId = String(formData.get("requestId") ?? "");
  const db = await getDb();

  // القراءة بصلاحيات المستخدم (RLS) تضمن أنه عضو في حساب الطلب
  const request = await db.maybeOne<{
    status: string;
    order_id: string | null;
    payment_status: string | null;
  }>(
    `select r.status, o.id as order_id, o.payment_status
     from public.service_requests r left join public.orders o on o.request_id = r.id
     where r.id = $1`,
    [requestId],
  );
  if (!request) return { message: "الطلب غير متاح." };

  // بعد بدء التنفيذ: يُحتسب جزء من الأتعاب للمزوّد حسب الإعدادات
  if (request.status === "in_progress") return cancelInProgress(requestId, user.id);

  if (request.order_id && request.payment_status === "paid") {
    // الإلغاء قبل بدء التنفيذ: استرداد كامل عبر البوابة ثم قيد عكسي وإلغاء في معاملة واحدة
    if (request.status !== "paid" && request.status !== "awaiting_client") {
      return { message: "لا يمكن الإلغاء بعد بدء التنفيذ." };
    }
    const payment = await db.maybeOne<{ id: string }>(
      "select id from public.payments where order_id = $1 and status = 'paid'",
      [request.order_id],
    );
    if (!payment) return { message: "تعذّر العثور على الدفعة." };
    try {
      await refundPayment(payment.id, {
        cancelRequest: true,
        note: "ألغاه العميل قبل بدء التنفيذ — استرداد كامل",
      });
    } catch (err) {
      console.error("refund failed", err);
      return { message: "تعذّر الاسترداد من بوابة الدفع؛ لم يُلغَ الطلب. حاول لاحقاً." };
    }
    revalidateRequestPages();
    return { message: "أُلغي الطلب وأُعيد المبلغ كاملاً." };
  }

  const { error } = await db.rpc("transition_request", {
    p_request_id: requestId,
    p_to: "cancelled",
    p_note: "ألغاه العميل",
  });
  if (error) return { message: rpcErrorMessage(error) };
  revalidateRequestPages();
  return { message: "أُلغي الطلب." };
}
