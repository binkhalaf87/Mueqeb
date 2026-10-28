"use client";

import { useActionState } from "react";
import { submitBid } from "@/app/actions/bids";
import type { FormState } from "@/app/actions/auth";
import { formatHalalas } from "@/lib/money";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Field, FormMessage, TextArea } from "@/components/ui";

type Values = {
  fee: string;
  govFees: string;
  durationDays: string;
  includes: string;
  needsFromClient: string;
};

export function BidForm({
  requestId,
  minFee,
  initial,
}: {
  requestId: string;
  minFee: number;
  initial?: Values;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitBid, {});

  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="أتعابك (ريال)"
          name="fee"
          inputMode="decimal"
          dir="ltr"
          defaultValue={initial?.fee}
          hint={`الحد الأدنى ${formatHalalas(minFee)}`}
          required
          error={state.errors?.fee}
        />
        <Field
          label="الرسوم الحكومية المتوقعة (ريال)"
          name="govFees"
          inputMode="decimal"
          dir="ltr"
          defaultValue={initial?.govFees}
          hint="معلوماتية فقط؛ يدفعها العميل مباشرة"
          error={state.errors?.govFees}
        />
        <Field
          label="المدة (أيام)"
          name="durationDays"
          type="number"
          min={1}
          max={365}
          dir="ltr"
          defaultValue={initial?.durationDays}
          required
          error={state.errors?.durationDays}
        />
      </div>
      <TextArea
        label="ما يشمله العرض"
        name="includes"
        rows={3}
        maxLength={1000}
        defaultValue={initial?.includes}
        error={state.errors?.includes}
      />
      <TextArea
        label="ما تحتاجه من العميل"
        name="needsFromClient"
        rows={2}
        maxLength={1000}
        defaultValue={initial?.needsFromClient}
        hint="مثل: التفويض في قوى، صور الإقامات. لا تطلب كلمات مرور أو رموز تحقق، ولا تضع أرقام تواصل."
        error={state.errors?.needsFromClient}
      />
      <Button type="submit" disabled={pending} className="sm:w-auto">
        {pending ? "جارٍ الحفظ…" : initial ? "حفظ التعديل" : "قدّم العرض"}
      </Button>
    </form>
  );
}
