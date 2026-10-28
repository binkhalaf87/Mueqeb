"use client";

import { useActionState, useState } from "react";
import { saveProviderService } from "@/app/actions/provider";
import type { FormState } from "@/app/actions/auth";
import { formatHalalas } from "@/lib/money";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Field, FormMessage, Select, TextArea } from "@/components/ui";

export type ServiceOption = {
  id: string;
  name: string;
  category: string;
  minFee: number;
  guideMin: number;
  guideMax: number;
};

type Values = { serviceTypeId: string; fee: string; durationDays: string; notes: string };

export function ServiceForm({
  options,
  serviceId,
  initial,
}: {
  options: ServiceOption[];
  serviceId?: string;
  initial?: Values;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProviderService, {});
  const [selectedId, setSelectedId] = useState(initial?.serviceTypeId ?? "");
  const selected = options.find((o) => o.id === selectedId);
  const editing = Boolean(serviceId);
  const prefix = serviceId ? `${serviceId}-` : "";

  if (!editing && options.length === 0) {
    return <p className="text-sm text-muted">أضفت كل الخدمات المتاحة.</p>;
  }

  const categories = [...new Set(options.map((o) => o.category))];

  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      {serviceId && <input type="hidden" name="serviceId" value={serviceId} />}

      {editing ? (
        <input type="hidden" name="serviceTypeId" value={selectedId} />
      ) : (
        <Select
          label="الخدمة"
          name="serviceTypeId"
          id={`${prefix}serviceTypeId`}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          error={state.errors?.serviceTypeId}
        >
          <option value="">اختر الخدمة…</option>
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {options
                .filter((o) => o.category === category)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      )}

      {selected && (
        <p className="rounded-lg bg-background px-3 py-2 text-sm" data-testid="fee-guide">
          الحد الأدنى للأتعاب: <strong>{formatHalalas(selected.minFee)}</strong> · النطاق
          الاسترشادي: {formatHalalas(selected.guideMin)} – {formatHalalas(selected.guideMax)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="الأتعاب «يبدأ من» (ريال)"
          name="fee"
          id={`${prefix}fee`}
          inputMode="decimal"
          dir="ltr"
          defaultValue={initial?.fee}
          required
          error={state.errors?.fee}
        />
        <Field
          label="المدة المتوقعة (أيام)"
          name="durationDays"
          id={`${prefix}durationDays`}
          type="number"
          min={1}
          max={365}
          dir="ltr"
          defaultValue={initial?.durationDays}
          required
          error={state.errors?.durationDays}
        />
      </div>
      <TextArea
        label="ملاحظات (اختياري)"
        name="notes"
        id={`${prefix}notes`}
        rows={2}
        maxLength={500}
        defaultValue={initial?.notes}
        error={state.errors?.notes}
      />
      <Button type="submit" disabled={pending} className="sm:w-auto">
        {pending ? "جارٍ الحفظ…" : editing ? "حفظ التعديل" : "إضافة الخدمة"}
      </Button>
    </form>
  );
}
