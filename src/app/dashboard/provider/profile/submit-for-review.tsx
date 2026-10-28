"use client";

import { useActionState } from "react";
import { submitProviderForReview } from "@/app/actions/provider";
import type { FormState } from "@/app/actions/auth";
import { Button, FormMessage } from "@/components/ui";

export function SubmitForReview({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState<FormState>(submitProviderForReview, {});

  return (
    <form action={action} className="space-y-3">
      <FormMessage>{state.message}</FormMessage>
      {!ready && <p className="text-sm text-muted">ارفع المستندات الأربعة واختر مدنك أولاً.</p>}
      <Button type="submit" disabled={pending || !ready} className="sm:w-auto">
        {pending ? "جارٍ الإرسال…" : "إرسال للتوثيق"}
      </Button>
    </form>
  );
}
