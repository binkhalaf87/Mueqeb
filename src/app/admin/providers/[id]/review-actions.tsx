"use client";

import { useActionState } from "react";
import { reviewProvider } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import type { ProviderStage } from "@/lib/providers/constants";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, FormMessage, SecondaryButton, TextArea } from "@/components/ui";

export function ReviewActions({ providerId, stage }: { providerId: string; stage: ProviderStage }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewProvider, {});

  const canApprove = stage === "under_review" || stage === "suspended";
  const canReject = stage === "under_review";
  const canSuspend = stage === "approved";

  if (!canApprove && !canReject && !canSuspend) {
    return (
      <div className="space-y-2">
        <FormMessage>{state.message}</FormMessage>
        <p className="text-sm text-muted">
          {stage === "draft"
            ? "لم يرسل المزوّد ملفه للتوثيق بعد."
            : "بانتظار تعديل المزوّد وإعادة الإرسال."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-3">
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="providerId" value={providerId} />
      {(canReject || canSuspend) && (
        <TextArea
          label={canSuspend ? "سبب الإيقاف" : "سبب الرفض (مطلوب عند الرفض)"}
          name="reason"
          rows={3}
          maxLength={500}
          hint="يظهر للمزوّد."
          error={state.errors?.reason}
        />
      )}
      {canApprove && (
        <Button type="submit" name="action" value="approve" disabled={pending}>
          {stage === "suspended" ? "إعادة التفعيل" : "اعتماد"}
        </Button>
      )}
      {canReject && (
        <SecondaryButton
          type="submit"
          name="action"
          value="reject"
          disabled={pending}
          className="w-full hover:border-danger hover:text-danger"
        >
          رفض
        </SecondaryButton>
      )}
      {canSuspend && (
        <SecondaryButton
          type="submit"
          name="action"
          value="suspend"
          disabled={pending}
          className="w-full hover:border-danger hover:text-danger"
        >
          إيقاف
        </SecondaryButton>
      )}
    </form>
  );
}
