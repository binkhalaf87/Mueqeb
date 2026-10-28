"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui";

/**
 * زر ينفّذ Server Action بحقول مخفية، مع تأكيد اختياري ورسالة النتيجة.
 */
export function ActionButton({
  action,
  fields,
  confirmText,
  className = "",
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  confirmText?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="space-y-2"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {children}
      </button>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
