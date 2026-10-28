"use client";

import { useActionState } from "react";
import { saveServiceType } from "@/app/actions/admin-ops";
import type { FormState } from "@/app/actions/auth";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Field, FormMessage, Select, SecondaryButton, TextArea } from "@/components/ui";

type Initial = {
  id: string;
  categoryId: string;
  slug: string;
  nameAr: string;
  description: string;
  minFee: string;
  guideMin: string;
  guideMax: string;
  requiredDocs: string;
  delegation: string;
  active: boolean;
};

export function ServiceTypeForm({
  categories,
  initial,
}: {
  categories: { id: string; name: string }[];
  initial?: Initial;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveServiceType, {});
  const p = initial ? `${initial.id}-` : "new-";
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-3" data-testid="service-type-form">
      <FormMessage>{state.message}</FormMessage>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {initial ? (
          <input type="hidden" name="categoryId" value={initial.categoryId} />
        ) : (
          <Select label="الفئة" name="categoryId" id={`${p}cat`} error={state.errors?.categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Field
          label="المعرّف (لاتيني)"
          name="slug"
          id={`${p}slug`}
          dir="ltr"
          defaultValue={initial?.slug}
          readOnly={Boolean(initial)}
          error={state.errors?.slug}
        />
        <Field
          label="الاسم"
          name="nameAr"
          id={`${p}name`}
          defaultValue={initial?.nameAr}
          error={state.errors?.nameAr}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field
          label="الحد الأدنى (ريال)"
          name="minFee"
          id={`${p}min`}
          dir="ltr"
          defaultValue={initial?.minFee}
          error={state.errors?.minFee}
        />
        <Field
          label="النطاق من (ريال)"
          name="guideMin"
          id={`${p}gmin`}
          dir="ltr"
          defaultValue={initial?.guideMin}
          error={state.errors?.guideMin}
        />
        <Field
          label="النطاق إلى (ريال)"
          name="guideMax"
          id={`${p}gmax`}
          dir="ltr"
          defaultValue={initial?.guideMax}
          error={state.errors?.guideMax}
        />
        <Select
          label="منصة التفويض"
          name="delegation"
          id={`${p}del`}
          defaultValue={initial?.delegation ?? "none"}
        >
          <option value="qiwa">قوى</option>
          <option value="balady">بلدي</option>
          <option value="mc">وزارة التجارة</option>
          <option value="none">بلا تفويض</option>
        </Select>
      </div>
      <TextArea
        label="الوصف"
        name="description"
        id={`${p}desc`}
        rows={2}
        defaultValue={initial?.description}
      />
      <TextArea
        label="المستندات المطلوبة (سطر لكل مستند)"
        name="requiredDocs"
        id={`${p}docs`}
        rows={3}
        defaultValue={initial?.requiredDocs}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
        متاحة للعملاء والمزوّدين
      </label>
      <SecondaryButton type="submit" disabled={pending}>
        {initial ? "حفظ التعديلات" : "إضافة الخدمة"}
      </SecondaryButton>
    </form>
  );
}
