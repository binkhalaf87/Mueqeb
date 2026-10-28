"use client";

import { useActionState, useState } from "react";
import { completeOnboarding, type FormState } from "@/app/actions/auth";
import { Button, Card, Field, FormMessage } from "@/components/ui";

type Role = "requester" | "provider";
type AccountType = "individual" | "establishment";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(completeOnboarding, {});
  const [role, setRole] = useState<Role | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("individual");

  return (
    <form action={action} className="space-y-6">
      <FormMessage>{state.message}</FormMessage>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">نوع الاستخدام</legend>
        <ChoiceCard
          name="role"
          value="requester"
          checked={role === "requester"}
          onChange={() => setRole("requester")}
          title="أطلب خدمة"
          description="لدي معاملة حكومية وأبحث عن مكتب تعقيب ينجزها."
        />
        <ChoiceCard
          name="role"
          value="provider"
          checked={role === "provider"}
          onChange={() => setRole("provider")}
          title="أقدّم خدمة"
          description="أمثّل مكتب خدمات عامة مرخّصاً وأرغب باستقبال الطلبات."
        />
      </fieldset>
      {state.errors?.role && <p className="text-sm text-danger">اختر نوع الاستخدام.</p>}

      {role === "requester" && (
        <Card className="space-y-4">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-semibold">نوع الحساب</legend>
            <ChoiceCard
              name="accountType"
              value="individual"
              checked={accountType === "individual"}
              onChange={() => setAccountType("individual")}
              title="فرد"
              description="معاملات شخصية باسمي."
            />
            <ChoiceCard
              name="accountType"
              value="establishment"
              checked={accountType === "establishment"}
              onChange={() => setAccountType("establishment")}
              title="منشأة"
              description="معاملات منشأة بسجل تجاري، ويمكن إضافة مستخدمين لاحقاً."
            />
          </fieldset>

          {accountType === "establishment" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="اسم المنشأة"
                name="establishmentName"
                defaultValue={state.values?.establishmentName}
                required
                error={state.errors?.establishmentName}
              />
              <Field
                label="رقم السجل التجاري"
                name="crNumber"
                defaultValue={state.values?.crNumber}
                inputMode="numeric"
                dir="ltr"
                maxLength={10}
                hint="10 أرقام"
                required
                error={state.errors?.crNumber}
              />
            </div>
          )}
        </Card>
      )}

      {role && (
        <Card className="space-y-4">
          {role === "provider" && (
            <p className="text-sm text-muted">
              لن تستقبل أي طلبات قبل أن تعتمد الإدارة توثيق مكتبك. ستُطلب مستندات الترخيص في خطوة
              لاحقة.
            </p>
          )}
          <Field
            label="المدينة (اختياري)"
            name="city"
            defaultValue={state.values?.city}
            error={state.errors?.city}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "متابعة"}
          </Button>
        </Card>
      )}
    </form>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-2xl border-2 p-5 transition has-focus-visible:ring-2 has-focus-visible:ring-primary/40 ${
        checked
          ? "border-primary bg-primary-soft"
          : "border-border bg-surface hover:border-primary/50"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="block text-lg font-semibold">{title}</span>
      <span className="mt-1 block text-sm text-muted">{description}</span>
    </label>
  );
}
