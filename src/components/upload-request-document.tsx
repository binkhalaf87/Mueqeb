"use client";

import { useActionState } from "react";
import { uploadRequestDocument } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { FormMessage, SecondaryButton } from "@/components/ui";

/** رفع مستند للطلب (العميل: مستنداته المطلوبة؛ المزوّد: إثبات الإنجاز) */
export function UploadRequestDocument({
  requestId,
  labels,
  testId,
}: {
  requestId: string;
  /** أسماء المستندات المقترحة؛ إن كانت فارغة يُكتب الاسم يدوياً */
  labels: string[];
  testId?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadRequestDocument, {});
  return (
    <form action={action} className="space-y-2" data-testid={testId}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-wrap items-center gap-2">
        {labels.length > 0 ? (
          <select
            name="label"
            aria-label="نوع المستند"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          >
            {labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
            <option value="مستند إضافي">مستند إضافي</option>
          </select>
        ) : (
          <input type="hidden" name="label" value="إثبات الإنجاز" />
        )}
        <input
          type="file"
          name="file"
          aria-label="الملف"
          accept="application/pdf,image/jpeg,image/png"
          required
          className="max-w-full text-sm file:me-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
        />
        <SecondaryButton type="submit" disabled={pending}>
          {pending ? "جارٍ الرفع…" : "رفع"}
        </SecondaryButton>
      </div>
      {state.errors?.file && <p className="text-sm text-danger">{state.errors.file}</p>}
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
