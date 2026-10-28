"use client";

import { useActionState } from "react";
import { signUp, type FormState } from "@/app/actions/auth";
import { Button, Field, FormMessage } from "@/components/ui";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <Field
        label="الاسم الكامل"
        name="fullName"
        defaultValue={state.values?.fullName}
        autoComplete="name"
        required
        error={state.errors?.fullName}
      />
      <Field
        label="الجوال أو البريد الإلكتروني"
        name="identifier"
        defaultValue={state.values?.identifier}
        autoComplete="username"
        dir="ltr"
        hint="مثال: 05XXXXXXXX أو name@example.com"
        required
        error={state.errors?.identifier}
      />
      <Field
        label="كلمة المرور"
        name="password"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        hint="8 أحرف على الأقل. هذه كلمة مرور حسابك في المنصة فقط."
        required
        error={state.errors?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
      </Button>
    </form>
  );
}
