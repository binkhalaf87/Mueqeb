"use client";

import { useActionState } from "react";
import { payWithTestCard } from "@/app/actions/payments";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Field, FormMessage } from "@/components/ui";

export function TestCardForm({ providerRef }: { providerRef: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(payWithTestCard, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-3" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="ref" value={providerRef} />
      <Field
        label="رقم البطاقة"
        name="card"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        placeholder="4111 1111 1111 1111"
        error={state.errors?.card}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="تاريخ الانتهاء"
          name="expiry"
          dir="ltr"
          placeholder="12/30"
          autoComplete="off"
        />
        <Field label="CVC" name="cvc" dir="ltr" placeholder="123" autoComplete="off" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ المعالجة…" : "ادفع"}
      </Button>
    </form>
  );
}
