"use client";

import { useActionState } from "react";
import { updateSettings } from "@/app/actions/admin-ops";
import { updateBlockedTerms, updateDelegationGuide } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Field, FormMessage, SecondaryButton, TextArea } from "@/components/ui";

export function SettingsForm({
  fields,
}: {
  fields: { key: string; label: string; unit: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSettings, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-3" data-testid="settings-form">
      <FormMessage>{state.message}</FormMessage>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field
            key={f.key}
            label={`${f.label} (${f.unit})`}
            name={f.key}
            inputMode="decimal"
            dir="ltr"
            defaultValue={f.value}
            error={state.errors?.[f.key]}
          />
        ))}
      </div>
      <SecondaryButton type="submit" disabled={pending}>
        حفظ الإعدادات
      </SecondaryButton>
    </form>
  );
}

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
