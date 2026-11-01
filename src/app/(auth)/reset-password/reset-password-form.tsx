"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/actions/account-recovery";
import type { FormState } from "@/app/actions/auth";
import { Button, Field, FormMessage } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage>{state.message}</FormMessage>
      <Field
        label="كلمة المرور الجديدة"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        required
        hint="8 أحرف على الأقل"
        error={state.errors?.newPassword}
      />
      <Field
        label="تأكيد كلمة المرور"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        required
        error={state.errors?.confirmPassword}
      />
      <p className="text-sm text-muted">ستخرج كل جلساتك المفتوحة على الأجهزة الأخرى.</p>
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : "احفظ كلمة المرور"}
      </Button>
    </form>
  );
}
