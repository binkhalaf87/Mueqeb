"use client";

import { useActionState } from "react";
import { saveProviderProfile } from "@/app/actions/provider";
import type { FormState } from "@/app/actions/auth";
import { SAUDI_CITIES } from "@/lib/cities";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Field, FormMessage, TextArea } from "@/components/ui";

type Initial = {
  officeName: string;
  crNumber: string;
  municipalLicenseNumber: string;
  cities: string[];
  bio: string;
};

export function ProfileForm({
  initial,
  identityEditable,
}: {
  initial?: Initial;
  identityEditable: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProviderProfile, {});

  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      {!identityEditable && (
        <p className="text-sm text-muted">
          الاسم والسجل والرخصة مقفلة أثناء المراجعة وبعد الاعتماد. يمكنك تعديل المدن والنبذة.
        </p>
      )}
      <Field
        label="اسم المكتب"
        name="officeName"
        defaultValue={initial?.officeName}
        readOnly={!identityEditable}
        required
        error={state.errors?.officeName}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="رقم السجل التجاري"
          name="crNumber"
          inputMode="numeric"
          dir="ltr"
          maxLength={10}
          defaultValue={initial?.crNumber}
          readOnly={!identityEditable}
          required
          error={state.errors?.crNumber}
        />
        <Field
          label="رقم الرخصة البلدية"
          name="municipalLicenseNumber"
          dir="ltr"
          defaultValue={initial?.municipalLicenseNumber}
          readOnly={!identityEditable}
          required
          error={state.errors?.municipalLicenseNumber}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">المدن المخدومة</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SAUDI_CITIES.map((city) => (
            <label key={city} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="cities"
                value={city}
                defaultChecked={initial?.cities.includes(city)}
                className="size-4 accent-[var(--primary)]"
              />
              {city}
            </label>
          ))}
        </div>
        {state.errors?.cities && <p className="mt-1 text-sm text-danger">{state.errors.cities}</p>}
      </fieldset>

      <TextArea
        label="نبذة عن المكتب (اختياري)"
        name="bio"
        defaultValue={initial?.bio}
        maxLength={1000}
        hint="خبرتكم والخدمات التي تتميزون بها. لا تضع أرقام تواصل أو روابط."
        error={state.errors?.bio}
      />
      <Button type="submit" disabled={pending} className="sm:w-auto">
        {pending ? "جارٍ الحفظ…" : "حفظ بيانات المكتب"}
      </Button>
    </form>
  );
}
