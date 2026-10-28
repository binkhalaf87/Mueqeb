"use client";

import { useActionState } from "react";
import { submitDelivery } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, FormMessage, TextArea } from "@/components/ui";

export function DeliveryForm({ requestId, hasProof }: { requestId: string; hasProof: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitDelivery, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-2" data-testid="delivery-form">
      <input type="hidden" name="requestId" value={requestId} />
      <TextArea
        label="وصف ما أُنجز"
        name="note"
        rows={3}
        maxLength={2000}
        error={state.errors?.note}
        hint={hasProof ? undefined : "ارفع ملف إثبات الإنجاز أولاً."}
      />
      <Button type="submit" disabled={pending} className="sm:w-auto">
        تسليم الخدمة
      </Button>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
