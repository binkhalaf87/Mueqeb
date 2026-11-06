"use client";

import { useActionState } from "react";
import { withdrawFromRequest } from "@/app/actions/execution";
import type { FormState } from "@/app/actions/auth";
import { Card, FormMessage, TextArea } from "@/components/ui";

/** اعتذار المكتب عن طلب مُرسى عليه: يُلغى الطلب ويُسترد للعميل كامل المبلغ */
export function WithdrawForm({ requestId, paid }: { requestId: string; paid: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(withdrawFromRequest, {});
  return (
    <Card className="space-y-3" data-testid="provider-withdraw">
      <h2 className="font-semibold">الاعتذار عن الطلب</h2>
      <p className="text-sm text-muted">
        إن تعذّر عليك تنفيذ الطلب فاعتذر عنه هنا:
        {paid ? " يُسترد للعميل المبلغ كاملاً" : " يُلغى الطلب"}، ولا تُستحق لك أتعاب. يُسجَّل
        الاعتذار في سجل مكتبك وتطّلع عليه الإدارة.
      </p>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm("تأكيد الاعتذار عن الطلب؟ يُلغى الطلب ولا يمكن التراجع.")) {
            e.preventDefault();
          }
        }}
        className="space-y-3"
        noValidate
      >
        <input type="hidden" name="requestId" value={requestId} />
        <TextArea
          label="سبب الاعتذار"
          name="reason"
          id="withdraw-reason"
          rows={3}
          maxLength={500}
          required
          hint="يظهر للعميل في سجل الطلب."
          error={state.errors?.reason}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
        >
          {pending ? "جارٍ التسجيل…" : "الاعتذار عن الطلب"}
        </button>
        <FormMessage>{state.message}</FormMessage>
      </form>
    </Card>
  );
}
