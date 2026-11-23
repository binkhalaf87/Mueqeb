"use client";

import { useActionState } from "react";
import { reconcileGatewayPayment } from "@/app/actions/admin-ops";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { FormMessage, SecondaryButton } from "@/components/ui";

/** مطابقة محاولة دفع معلّقة برقم معاملتها في لوحة البوابة */
export function ReconcileForm({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reconcileGatewayPayment, {});
  return (
    <form
      onSubmit={keepValuesSubmit(action)}
      className="flex flex-wrap items-start gap-2"
      data-testid="reconcile-form"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <div>
        <label htmlFor={`tx-${paymentId}`} className="sr-only">
          رقم المعاملة في لوحة البوابة
        </label>
        <input
          id={`tx-${paymentId}`}
          name="transactionId"
          placeholder="رقم المعاملة (Transaction ID)"
          dir="ltr"
          inputMode="numeric"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
        />
        {state.errors?.transactionId && (
          <p className="text-sm text-danger">{state.errors.transactionId}</p>
        )}
      </div>
      <SecondaryButton type="submit" disabled={pending}>
        {pending ? "جارٍ الاستعلام…" : "تحقق من البوابة وطبّق"}
      </SecondaryButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
