"use client";

import { useActionState } from "react";
import { updateBlockedTerms, updateDelegationGuide } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Field, FormMessage, SecondaryButton, TextArea } from "@/components/ui";

export function GuideForm({
  platform,
  title,
  steps,
}: {
  platform: string;
  title: string;
  steps: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateDelegationGuide, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-2">
      <input type="hidden" name="platform" value={platform} />
      <Field label="العنوان" name="title" id={`title-${platform}`} defaultValue={title} />
      <TextArea
        label="الخطوات (سطر لكل خطوة)"
        name="steps"
        id={`steps-${platform}`}
        rows={6}
        defaultValue={steps}
      />
      <SecondaryButton type="submit" disabled={pending}>
        حفظ
      </SecondaryButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}

export function BlockedTermsForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateBlockedTerms, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-2">
      <TextArea label="الكلمات" name="terms" rows={8} defaultValue={initial} dir="auto" />
      <SecondaryButton type="submit" disabled={pending}>
        حفظ
      </SecondaryButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
