"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/app/actions/auth";
import { Button, Field, FormMessage } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage>{state.message}</FormMessage>
      <Field
        label="الجوال أو البريد الإلكتروني"
        name="identifier"
        defaultValue={state.values?.identifier}
        autoComplete="username"
        dir="ltr"
        required
        error={state.errors?.identifier}
      />
      <Field
        label="كلمة المرور"
        name="password"
        type="password"
        autoComplete="current-password"
        dir="ltr"
        required
        error={state.errors?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الدخول…" : "دخول"}
      </Button>
    </form>
  );
}
