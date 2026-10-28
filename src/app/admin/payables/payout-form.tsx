"use client";

import { useActionState } from "react";
import { recordPayout } from "@/app/actions/admin-ops";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { FormMessage, SecondaryButton } from "@/components/ui";

export function PayoutForm({
  providerId,
  expected,
  amountLabel,
}: {
  providerId: string;
  expected: number;
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordPayout, {});
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm(`تأكيد تسجيل صرف ${amountLabel}؟ لا يمكن التراجع إلا بقيد عكسي.`)) {
          e.preventDefault();
          return;
        }
        keepValuesSubmit(action)(e);
      }}
      className="flex flex-wrap items-start gap-2"
      data-testid="payout-form"
    >
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="expected" value={expected} />
      <div>
        <label htmlFor={`ref-${providerId}`} className="sr-only">
          مرجع التحويل البنكي
        </label>
        <input
          id={`ref-${providerId}`}
          name="bankReference"
          placeholder="مرجع التحويل البنكي"
          dir="ltr"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
        />
        {state.errors?.bankReference && (
          <p className="text-sm text-danger">{state.errors.bankReference}</p>
        )}
      </div>
      <SecondaryButton type="submit" disabled={pending}>
        تسجيل صرف {amountLabel}
      </SecondaryButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
