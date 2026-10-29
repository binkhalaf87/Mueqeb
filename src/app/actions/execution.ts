"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, requireRole } from "@/lib/auth/session";
import { getDb, serviceDb } from "@/lib/db/server";
import { attempt } from "@/lib/db/core";
import { removeObjects, uploadObject } from "@/lib/storage";
import { REQUEST_DOCUMENTS_BUCKET } from "@/lib/execution/queries";
import { ALLOWED_DOCUMENT_MIME } from "@/lib/providers/constants";
import { validateDocumentFile } from "@/lib/providers/validation";
import { CREDENTIALS_MESSAGE, mentionsCredentials } from "@/lib/contact-info";
import { parseSarToHalalas } from "@/lib/money";
import { rpcErrorMessage } from "@/lib/requests/constants";
import { refundAtGateway } from "@/lib/payments/process";
import type { FormState } from "./auth";

const EXECUTION_ERRORS: Record<string, string> = {
  delegation_not_confirmed: "بانتظار تأكيد العميل لمنح التفويض.",
  delivery_proof_required: "ارفع ملف إثبات الإنجاز أولاً.",
  delivery_note_required: "اكتب وصفاً لما أُنجز.",
  reason_required: "اكتب سبب الاعتراض.",
  invalid_status: "لا يمكن تنفيذ هذا الإجراء في حالة الطلب الحالية.",
  invalid_refund_amount: "مبلغ الاسترداد غير صالح.",
  thread_closed: "أُغلقت المحادثة لانتهاء الطلب.",
};

function message(error: { message: string }) {
  const key = Object.keys(EXECUTION_ERRORS).find((k) => error.message.includes(k));
  return key ? EXECUTION_ERRORS[key] : rpcErrorMessage(error);
}

function revalidateAll() {
  revalidatePath("/dashboard/requester", "layout");
  revalidatePath("/dashboard/provider", "layout");
  revalidatePath("/admin", "layout");
}

const requestIdOf = (formData: FormData) => String(formData.get("requestId") ?? "");

// ============ العميل ============

export async function confirmDelegation(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const db = await getDb();
  const { error } = await db.rpc("confirm_delegation", {
    p_request_id: requestIdOf(formData),
  });
  if (error) return { message: message(error) };
  revalidateAll();
  return { message: "سُجّل منح التفويض. سيبدأ المكتب التنفيذ." };
}

export async function confirmCompletion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const db = await getDb();
  const { error } = await db.rpc("confirm_completion", {
    p_request_id: requestIdOf(formData),
  });
  if (error) return { message: message(error) };
  revalidateAll();
  return { message: "شكراً لتأكيدك. اكتمل الطلب." };
}

export async function openDispute(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("requester");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { errors: { reason: "اكتب سبب الاعتراض (5 أحرف على الأقل)." } };
  if (mentionsCredentials(reason)) return { errors: { reason: CREDENTIALS_MESSAGE } };
  const db = await getDb();
  const { error } = await db.rpc("open_dispute", {
    p_request_id: requestIdOf(formData),
    p_reason: reason,
  });
  if (error) return { message: message(error) };
  revalidateAll();
  return { message: "سُجّل اعتراضك وستراجعه الإدارة." };
}

// ============ المزوّد ============

export async function startExecution(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("provider");
  const db = await getDb();
  const { error } = await db.rpc("start_execution", { p_request_id: requestIdOf(formData) });
  if (error) return { message: message(error) };
  revalidateAll();
  return { message: "بدأ التنفيذ." };
}

export async function submitDelivery(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("provider");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { errors: { note: "اكتب وصفاً لما أُنجز." } };
  if (mentionsCredentials(note)) return { errors: { note: CREDENTIALS_MESSAGE } };
  const db = await getDb();
  const { error } = await db.rpc("submit_delivery", {
    p_request_id: requestIdOf(formData),
    p_note: note,
  });
  if (error) return { message: message(error), values: { note } };
  revalidateAll();
  return { message: "سُلّمت الخدمة. بانتظار تأكيد العميل." };
}

// ============ المستندات (العميل أو المزوّد) ============

export async function uploadRequestDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "requester" && user.role !== "provider")) {
    return { message: "غير مصرح." };
  }
  const requestId = requestIdOf(formData);
  if (!z.uuid().safeParse(requestId).success) return { message: "طلب غير صالح." };
  const kind = user.role === "provider" ? "delivery_proof" : "client_document";
  const label =
    String(formData.get("label") ?? "")
      .trim()
      .slice(0, 120) || "مستند";
  const file = formData.get("file");
  const fileError = validateDocumentFile(file);
  if (fileError) return { errors: { file: fileError } };
  const doc = file as File;

  const ext = ALLOWED_DOCUMENT_MIME[doc.type as keyof typeof ALLOWED_DOCUMENT_MIME];
  const path = `${requestId}/${kind}/${randomUUID()}.${ext}`;
  const db = await getDb();
  // RLS في storage.objects والجدول يتحقق من الدور وحالة الطلب
  const { error: uploadError } = await uploadObject(db, REQUEST_DOCUMENTS_BUCKET, path, doc);
  if (uploadError) return { message: "لا يمكن رفع ملفات في حالة الطلب الحالية." };

  const { error } = await attempt(
    db.query(
      `insert into public.request_documents
         (request_id, kind, label, storage_path, file_name, mime_type, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        requestId,
        kind,
        label,
        path,
        doc.name.slice(0, 200) || `document.${ext}`,
        doc.type,
        doc.size,
        user.id,
      ],
    ),
  );
  if (error) {
    await removeObjects(db, REQUEST_DOCUMENTS_BUCKET, [path]);
    return { message: "تعذّر حفظ المستند." };
  }
  revalidateAll();
  return { message: "رُفع المستند." };
}

// ============ المحادثة ============

export type SendMessageState = {
  status?: "sent" | "masked" | "blocked" | "error";
  message?: string;
};

export async function sendMessage(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "سجّل الدخول." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { status: "error", message: "اكتب رسالة." };
  const db = await getDb();
  const { data, error } = await db.rpc("send_message", {
    p_request_id: requestIdOf(formData),
    p_provider_id: String(formData.get("providerId") ?? ""),
    p_body: body.slice(0, 2000),
  });
  if (error) return { status: "error", message: message(error) };
  const result = data as { status: "sent" | "masked" | "blocked" };
  if (result.status === "blocked") {
    return {
      status: "blocked",
      message:
        "لم تُرسل الرسالة: لا يجوز طلب أو مشاركة كلمات مرور أو رموز تحقق للحسابات الحكومية. سُجّلت المحاولة للإدارة.",
    };
  }
  if (result.status === "masked") {
    return {
      status: "masked",
      message: "حُجبت أرقام التواصل أو الروابط: التواصل داخل المنصة فقط حتى الترسية.",
    };
  }
  return { status: "sent" };
}

// ============ الإدارة ============

const disputeSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["provider", "full_refund", "partial_refund"]),
    refund: z.string().optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .transform((v, ctx) => {
    if (v.decision !== "partial_refund") return { ...v, refundHalalas: 0 };
    const halalas = parseSarToHalalas(v.refund ?? "");
    if (!halalas || halalas <= 0) {
      ctx.addIssue({ code: "custom", path: ["refund"], message: "أدخل مبلغ الاسترداد بالريال" });
      return z.NEVER;
    }
    return { ...v, refundHalalas: halalas };
  });

export async function resolveDispute(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin");
  const parsed = disputeSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    refund: formData.get("refund") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return {
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  const { requestId, decision, refundHalalas, note } = parsed.data;

  const db = await getDb();
  const order = await db.maybeOne<{ id: string; fee_halalas: number; total_paid_halalas: number }>(
    "select id, fee_halalas, total_paid_halalas from public.orders where request_id = $1",
    [requestId],
  );
  if (!order) return { message: "الطلب غير موجود." };
  const amount =
    decision === "full_refund"
      ? order.total_paid_halalas
      : decision === "partial_refund"
        ? refundHalalas
        : 0;
  if (decision === "partial_refund" && amount > order.fee_halalas) {
    return {
      errors: { refund: "الاسترداد الجزئي لا يتجاوز أتعاب المزوّد؛ استخدم الاسترداد الكامل." },
    };
  }

  let refundRef: string | null;
  try {
    refundRef = await refundAtGateway(order.id, amount);
  } catch (err) {
    console.error("dispute refund failed", err);
    return { message: "تعذّر الاسترداد من بوابة الدفع؛ لم يُسجّل القرار." };
  }
  const { error } = await serviceDb().rpc("resolve_dispute", {
    p_request_id: requestId,
    p_decision: decision,
    p_refund_halalas: amount,
    p_refund_ref: refundRef ?? "",
    p_admin_id: user.id,
    p_note: note ?? "",
  });
  if (error) return { message: message(error) };
  revalidateAll();
  return { message: "سُجّل القرار وسُوّيت المبالغ." };
}

export async function updateDelegationGuide(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("admin");
  const platform = String(formData.get("platform") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const steps = String(formData.get("steps") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (title.length < 2 || steps.length === 0 || steps.length > 20) {
    return { message: "أدخل عنواناً وخطوة واحدة على الأقل (سطر لكل خطوة، حتى 20)." };
  }
  if (steps.some(mentionsCredentials) || mentionsCredentials(title)) {
    return { message: "الإرشادات لا يجوز أن تطلب كلمات مرور أو رموز تحقق." };
  }
  const db = await getDb();
  const { error } = await attempt(
    db.query(
      `update public.delegation_guides
       set title = $2, steps = $3, updated_at = now(), updated_by = $4
       where platform = $1`,
      [platform, title, steps, user.id],
    ),
  );
  if (error) return { message: "تعذّر الحفظ." };
  revalidateAll();
  return { message: "حُفظت الإرشادات." };
}

export async function updateBlockedTerms(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const terms = [
    ...new Set(
      String(formData.get("terms") ?? "")
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  ].slice(0, 200);
  if (terms.length === 0) return { message: "أدخل كلمة واحدة على الأقل." };
  const db = await getDb();
  const { error } = await attempt(
    db.query("update public.settings set value = $2::jsonb, updated_at = now() where key = $1", [
      "chat_blocked_terms",
      JSON.stringify(terms),
    ]),
  );
  if (error) return { message: "تعذّر الحفظ." };
  revalidateAll();
  return { message: `حُفظت ${terms.length} كلمة.` };
}
