"use client";

import { useActionState, useRef, useEffect } from "react";
import {
  changeLoginEmail,
  changeLoginPassword,
  updateEstablishment,
  updateProfile,
} from "@/app/actions/account";
import type { FormState } from "@/app/actions/auth";
import { SAUDI_CITIES } from "@/lib/cities";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Field, FormMessage, Select, TextArea } from "@/components/ui";

export function ProfileForm({ fullName, city }: { fullName: string; city: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="الاسم الكامل"
          name="fullName"
          defaultValue={state.values?.fullName ?? fullName}
          required
          error={state.errors?.fullName}
        />
        <Select
          label="المدينة"
          name="city"
          defaultValue={state.values?.city ?? city}
          error={state.errors?.city}
        >
          <option value="">—</option>
          {SAUDI_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        حفظ البيانات
      </Button>
    </form>
  );
}

export function EstablishmentForm({
  accountId,
  establishmentName,
  about,
}: {
  accountId: string;
  establishmentName: string;
  about: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEstablishment, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="accountId" value={accountId} />
      <Field
        label="اسم المنشأة"
        name="establishmentName"
        defaultValue={state.values?.establishmentName ?? establishmentName}
        required
        error={state.errors?.establishmentName}
      />
      <TextArea
        label="نبذة عن المنشأة"
        name="about"
        maxLength={1000}
        defaultValue={state.values?.about ?? about}
        hint="نشاط المنشأة وحجمها مثلاً. تظهر لك ولأعضاء حسابك فقط."
        error={state.errors?.about}
      />
      <Button type="submit" disabled={pending}>
        حفظ بيانات المنشأة
      </Button>
    </form>
  );
}

export function EmailForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeLoginEmail, {});
  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={email ? "البريد الجديد" : "أضف بريداً للدخول"}
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          defaultValue={state.values?.email}
          required
          error={state.errors?.email}
        />
        <Field
          id="email-currentPassword"
          label="كلمة المرور الحالية"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          error={state.errors?.currentPassword}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {email ? "تغيير البريد" : "إضافة البريد"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changeLoginPassword, {});
  const formRef = useRef<HTMLFormElement>(null);
  // بعد النجاح تُمسح الحقول (لا نُبقي كلمات المرور في النموذج)
  useEffect(() => {
    if (state.message && !state.errors) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} onSubmit={keepValuesSubmit(action)} className="space-y-4" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <Field
        id="password-currentPassword"
        label="كلمة المرور الحالية"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.errors?.currentPassword}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="كلمة المرور الجديدة"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hint="8 أحرف على الأقل"
          required
          error={state.errors?.newPassword}
        />
        <Field
          label="تأكيد كلمة المرور الجديدة"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          error={state.errors?.confirmPassword}
        />
      </div>
      <Button type="submit" disabled={pending}>
        تغيير كلمة المرور
      </Button>
    </form>
  );
}
