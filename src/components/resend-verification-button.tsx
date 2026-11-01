"use client";

import { useActionState } from "react";
import { resendVerificationEmail } from "@/app/actions/account-recovery";
import type { FormState } from "@/app/actions/auth";

export function ResendVerificationButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    () => resendVerificationEmail(),
    {},
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="font-medium underline disabled:opacity-60"
      >
        {pending ? "جارٍ الإرسال…" : "أعد إرسال الرابط"}
      </button>
      {state.message && <span data-testid="resend-result">{state.message}</span>}
    </form>
  );
}
