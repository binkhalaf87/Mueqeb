"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import {
  CONTACT_INFO_MESSAGE,
  CREDENTIALS_MESSAGE,
  containsContactInfo,
  mentionsCredentials,
} from "@/lib/contact-info";
import type { FunctionArgs } from "@/lib/db/types";
import type { FormState } from "./auth";

const score = z.coerce
  .number({ message: "اختر تقييماً" })
  .int()
  .min(1, "اختر تقييماً من 1 إلى 5")
  .max(5, "اختر تقييماً من 1 إلى 5");

const requesterReview = z.object({
  speed: score,
  accuracy: score,
  communication: score,
  comment: z
    .string()
    .trim()
    .max(1000, "التعليق طويل جداً")
    .refine((v) => !containsContactInfo(v), CONTACT_INFO_MESSAGE)
    .refine((v) => !mentionsCredentials(v), CREDENTIALS_MESSAGE),
});

const providerReview = z.object({ requestClarity: score, documentsSpeed: score });

const ERRORS: Record<string, string> = {
  not_reviewable: "التقييم متاح فقط بعد اكتمال طلب مدفوع عبر المنصة.",
  already_reviewed: "قيّمت هذا الطلب مسبقاً، والتقييم لا يُعدّل.",
};

export async function submitReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "requester" && user.role !== "provider"))
    return { message: "غير مصرح." };
  const requestId = String(formData.get("requestId") ?? "");
  const db = await getDb();

  let args: FunctionArgs<"submit_review">;
  if (user.role === "requester") {
    const parsed = requesterReview.safeParse({
      speed: formData.get("speed"),
      accuracy: formData.get("accuracy"),
      communication: formData.get("communication"),
      comment: formData.get("comment") ?? "",
    });
    if (!parsed.success) {
      return {
        errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      };
    }
    args = {
      p_request_id: requestId,
      p_speed: parsed.data.speed,
      p_accuracy: parsed.data.accuracy,
      p_communication: parsed.data.communication,
      p_comment: parsed.data.comment || undefined,
    };
  } else {
    const parsed = providerReview.safeParse({
      requestClarity: formData.get("requestClarity"),
      documentsSpeed: formData.get("documentsSpeed"),
    });
    if (!parsed.success) {
      return {
        errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      };
    }
    args = {
      p_request_id: requestId,
      p_request_clarity: parsed.data.requestClarity,
      p_documents_speed: parsed.data.documentsSpeed,
    };
  }

  const { error } = await db.rpc("submit_review", args);
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
    return { message: key ? ERRORS[key] : "تعذّر حفظ التقييم." };
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath("/providers", "layout");
  return { message: "شكراً، سُجّل تقييمك." };
}
