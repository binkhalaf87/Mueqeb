"use client";

import { useActionState } from "react";
import { setSuspension } from "@/app/actions/admin-ops";
import type { FormState } from "@/app/actions/auth";
import { FormMessage, SecondaryButton } from "@/components/ui";

export function SuspensionForm({
  profileId,
  suspended,
  name,
}: {
  profileId: string;
  suspended: boolean;
  name: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(setSuspension, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const verb = suspended ? "إعادة تفعيل" : "إيقاف";
        if (!window.confirm(`${verb} حساب ${name || "المستخدم"}؟`)) e.preventDefault();
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="suspend" value={String(!suspended)} />
      {!suspended && (
        <div>
          <label htmlFor={`reason-${profileId}`} className="sr-only">
            سبب الإيقاف
          </label>
          <input
            id={`reason-${profileId}`}
            name="reason"
            placeholder="سبب الإيقاف"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          />
          {state.errors?.reason && <p className="text-sm text-danger">{state.errors.reason}</p>}
        </div>
      )}
      <SecondaryButton
        type="submit"
        disabled={pending}
        className={suspended ? "" : "hover:border-danger hover:text-danger"}
      >
        {suspended ? "إعادة التفعيل" : "إيقاف"}
      </SecondaryButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
