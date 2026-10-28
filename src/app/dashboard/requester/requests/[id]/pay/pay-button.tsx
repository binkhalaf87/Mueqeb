"use client";

import { useActionState } from "react";
import { startPayment } from "@/app/actions/payments";
import type { FormState } from "@/app/actions/auth";
import { Button, FormMessage } from "@/components/ui";

export function PayButton({ requestId, total }: { requestId: string; total: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startPayment, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <FormMessage>{state.message}</FormMessage>
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ التحويل لبوابة الدفع…" : `ادفع ${total} بالبطاقة`}
      </Button>
    </form>
  );
}
