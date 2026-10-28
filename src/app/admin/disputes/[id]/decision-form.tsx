"use client";

import { useActionState, useState } from "react";
import { resolveDispute } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Field, FormMessage, TextArea } from "@/components/ui";

export function DecisionForm({
  requestId,
  feeSar,
  feeLabel,
  totalLabel,
}: {
  requestId: string;
  feeSar: number;
  feeLabel: string;
  totalLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(resolveDispute, {});
  const [decision, setDecision] = useState("provider");

  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm("تسجيل القرار نهائي وتُسوّى المبالغ فوراً. متابعة؟")) {
          e.preventDefault();
          return;
        }
        keepValuesSubmit(action)(e);
      }}
      className="space-y-3 border-t border-border pt-3"
      data-testid="decision-form"
    >
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-semibold">القرار</legend>
        {[
          { value: "provider", label: "لصالح المكتب (يكتمل ويُستحق صافي أتعابه)" },
          { value: "full_refund", label: `استرداد كامل للعميل (${totalLabel})` },
          { value: "partial_refund", label: `استرداد جزئي (حتى ${feeLabel} من أتعاب المكتب)` },
        ].map((o) => (
          <label key={o.value} className="flex items-start gap-2">
            <input
              type="radio"
              name="decision"
              value={o.value}
              checked={decision === o.value}
              onChange={() => setDecision(o.value)}
              className="mt-1"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      {decision === "partial_refund" && (
        <Field
          label="مبلغ الاسترداد (ريال)"
          name="refund"
          inputMode="decimal"
          dir="ltr"
          hint={`من 0.01 حتى ${feeSar}. رسم الخدمة لا يُسترد في الاسترداد الجزئي.`}
          error={state.errors?.refund}
        />
      )}
      <TextArea label="ملاحظة القرار (تظهر للعميل)" name="note" rows={2} maxLength={2000} />
      <Button type="submit" disabled={pending}>
        تسجيل القرار
      </Button>
    </form>
  );
}
