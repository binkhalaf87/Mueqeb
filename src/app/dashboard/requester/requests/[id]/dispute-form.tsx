"use client";

import { useActionState } from "react";
import { openDispute } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { FormMessage, SecondaryButton, TextArea } from "@/components/ui";

export function DisputeForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(openDispute, {});
  return (
    <form action={action} className="space-y-2" data-testid="dispute-form">
      <input type="hidden" name="requestId" value={requestId} />
      <TextArea
        label="سبب الاعتراض"
        name="reason"
        rows={2}
        maxLength={2000}
        hint="تراجع الإدارة المحادثة والمستندات ثم تقرر. المبلغ يبقى محفوظاً حتى القرار."
        error={state.errors?.reason}
      />
      <SecondaryButton
        type="submit"
        disabled={pending}
        className="hover:border-danger hover:text-danger"
      >
        اعتراض
      </SecondaryButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
