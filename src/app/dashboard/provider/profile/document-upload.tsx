"use client";

import { useActionState } from "react";
import { uploadProviderDocument } from "@/app/actions/provider";
import type { FormState } from "@/app/actions/auth";
import { FormMessage, SecondaryButton } from "@/components/ui";

export function DocumentUpload({
  docType,
  label,
  editable,
  current,
}: {
  docType: string;
  label: string;
  editable: boolean;
  current: { fileName: string; url: string | null } | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadProviderDocument, {});

  return (
    <div className="space-y-2 py-4" data-testid={`doc-${docType}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{label}</span>
        {current ? (
          <span className="text-sm text-muted">
            ✓ {current.fileName}
            {current.url && (
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ms-2 text-primary hover:underline"
              >
                عرض
              </a>
            )}
          </span>
        ) : (
          <span className="text-sm text-muted">لم يُرفع بعد</span>
        )}
      </div>
      {editable && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="docType" value={docType} />
          <input
            type="file"
            name="file"
            aria-label={`ملف ${label}`}
            accept="application/pdf,image/jpeg,image/png"
            required
            className="max-w-full text-sm file:me-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
          />
          <SecondaryButton type="submit" disabled={pending}>
            {pending ? "جارٍ الرفع…" : current ? "استبدال" : "رفع"}
          </SecondaryButton>
        </form>
      )}
      {state.errors?.file && <p className="text-sm text-danger">{state.errors.file}</p>}
      <FormMessage>{state.message}</FormMessage>
    </div>
  );
}
