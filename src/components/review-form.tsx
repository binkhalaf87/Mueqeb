"use client";

import { useActionState } from "react";
import { submitReview } from "@/app/actions/reviews";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, FormMessage, TextArea } from "@/components/ui";

function ScoreField({ name, label, error }: { name: string; label: string; error?: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-1" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded-lg border border-border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-primary-soft"
          >
            <input
              type="radio"
              name={name}
              value={n}
              className="sr-only"
              aria-label={`${label} ${n}`}
            />
            {n}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

export function ReviewForm({
  requestId,
  role,
}: {
  requestId: string;
  role: "requester" | "provider";
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitReview, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-3" data-testid="review-form">
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="requestId" value={requestId} />
      {role === "requester" ? (
        <>
          <ScoreField name="speed" label="السرعة" error={state.errors?.speed} />
          <ScoreField name="accuracy" label="الدقة" error={state.errors?.accuracy} />
          <ScoreField name="communication" label="التواصل" error={state.errors?.communication} />
          <TextArea
            label="تعليق (اختياري)"
            name="comment"
            rows={2}
            maxLength={1000}
            hint="يظهر للعموم في صفحة المكتب دون اسمك."
            error={state.errors?.comment}
          />
        </>
      ) : (
        <>
          <ScoreField
            name="requestClarity"
            label="وضوح الطلب"
            error={state.errors?.requestClarity}
          />
          <ScoreField
            name="documentsSpeed"
            label="سرعة تسليم المستندات"
            error={state.errors?.documentsSpeed}
          />
        </>
      )}
      <p className="text-xs text-muted">التقييم نهائي ولا يمكن تعديله بعد الإرسال.</p>
      <Button type="submit" disabled={pending} className="sm:w-auto">
        إرسال التقييم
      </Button>
    </form>
  );
}
