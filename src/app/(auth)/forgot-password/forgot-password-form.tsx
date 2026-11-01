"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/account-recovery";
import type { FormState } from "@/app/actions/auth";
import { Button, Field, FormMessage } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <Field
        label="البريد الإلكتروني"
        name="email"
        type="email"
        defaultValue={state.values?.email}
        autoComplete="email"
        dir="ltr"
        required
        error={state.errors?.email}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الإرسال…" : "أرسل رابط الاستعادة"}
      </Button>
    </form>
  );
}
