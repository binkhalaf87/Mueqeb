"use client";

import { useFormStatus } from "react-dom";
import { SecondaryButton } from "@/components/ui";
import type { ComponentProps } from "react";

/** زر إرسال لنماذج Server Actions البسيطة يعطّل نفسه أثناء التنفيذ */
export function FormSubmit({ children, ...props }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <SecondaryButton type="submit" disabled={pending} {...props}>
      {children}
    </SecondaryButton>
  );
}
