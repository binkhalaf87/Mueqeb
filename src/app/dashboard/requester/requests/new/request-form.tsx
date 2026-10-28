"use client";

import { useActionState, useState } from "react";
import { createRequest } from "@/app/actions/requests";
import type { FormState } from "@/app/actions/auth";
import { SAUDI_CITIES } from "@/lib/cities";
import { formatHalalas } from "@/lib/money";
import { DELEGATION_LABEL, type DelegationPlatform } from "@/lib/providers/constants";
import type { RequestMode } from "@/lib/requests/constants";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Card, FormMessage, Select, TextArea } from "@/components/ui";

export type ServiceOption = {
  id: string;
  name: string;
  category: string;
  guideMin: number;
  guideMax: number;
  requiredDocs: string[];
  delegation: DelegationPlatform;
};

export type ProviderTarget = {
  id: string;
  officeName: string;
  cities: string[];
  feeHalalas: number;
  durationDays: number;
};

export function RequestForm({
  mode,
  options,
  initialServiceId,
  provider,
  accounts,
}: {
  mode: RequestMode;
  options: ServiceOption[];
  initialServiceId: string;
  provider?: ProviderTarget;
  accounts: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRequest, {});
  const [serviceId, setServiceId] = useState(initialServiceId);
  const service = options.find((o) => o.id === serviceId);
  const categories = [...new Set(options.map((o) => o.category))];
  const cities = provider ? provider.cities : SAUDI_CITIES;

  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-6" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="mode" value={mode} />
      {provider && <input type="hidden" name="providerId" value={provider.id} />}

      <Card className="space-y-4">
        {accounts.length > 1 ? (
          <Select label="الحساب" name="accountId" defaultValue={accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        ) : (
          <input type="hidden" name="accountId" value={accounts[0]?.id ?? ""} />
        )}

        {mode === "public" ? (
          <Select
            label="الخدمة"
            name="serviceTypeId"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
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
        ) : (
          <>
            <input type="hidden" name="serviceTypeId" value={serviceId} />
            <p>
              <span className="text-muted">الخدمة: </span>
              <strong>{service?.name}</strong>
            </p>
          </>
        )}

        {service && (
          <div
            className="space-y-2 rounded-lg bg-background p-4 text-sm"
            data-testid="service-info"
          >
            {mode === "direct_listed" && provider ? (
              <p>
                السعر المعلن: <strong>{formatHalalas(provider.feeHalalas)}</strong> · المدة
                المتوقعة: {provider.durationDays} يوم
              </p>
            ) : (
              <p>
                السعر الاسترشادي لأتعاب هذه الخدمة:{" "}
                <strong>
                  {formatHalalas(service.guideMin)} – {formatHalalas(service.guideMax)}
                </strong>
              </p>
            )}
            <p className="text-muted">
              الرسوم الحكومية لا تُدفع عبر المنصة؛ تدفعها مباشرة عبر القناة الرسمية.
            </p>
            {service.delegation !== "none" && (
              <p className="text-muted">
                سيحتاج المكتب تفويضاً عبر منصة {DELEGATION_LABEL[service.delegation]} بعد الترسية.
                لن نطلب منك أبداً كلمة مرور أو رمز تحقق لحساباتك الحكومية.
              </p>
            )}
          </div>
        )}

        {service && service.requiredDocs.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">المستندات المتوفرة لديك</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {service.requiredDocs.map((doc) => (
                <label key={doc} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="availableDocs"
                    value={doc}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {doc}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              يراها المزوّدون كقائمة فقط؛ لا ترفع ملفات الآن.
            </p>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="المدينة"
            name="city"
            defaultValue={provider?.cities.length === 1 ? provider.cities[0] : ""}
            error={state.errors?.city}
          >
            <option value="">اختر المدينة…</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">الاستعجال</legend>
            <div className="flex gap-4 pt-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="urgency" value="normal" defaultChecked />
                عادي
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="urgency" value="urgent" />
                مستعجل
              </label>
            </div>
          </fieldset>
        </div>

        <TextArea
          label={mode === "public" ? "وصف الطلب" : "وصف الطلب (اختياري)"}
          name="description"
          rows={4}
          maxLength={1000}
          hint="يراه المزوّدون قبل الترسية. لا تكتب اسمك أو أرقام تواصل أو روابط."
          error={state.errors?.description}
        />
        <TextArea
          label="ملاحظات خاصة (اختياري)"
          name="privateNotes"
          rows={3}
          maxLength={2000}
          hint="لا يراها إلا المكتب الذي تختاره، بعد الترسية فقط."
          error={state.errors?.privateNotes}
        />
      </Card>

      <Button type="submit" disabled={pending} className="sm:w-auto">
        {pending
          ? "جارٍ الإرسال…"
          : mode === "public"
            ? "انشر الطلب"
            : mode === "direct_listed"
              ? "أرسل الطلب بالسعر المعلن"
              : "اطلب عرض السعر"}
      </Button>
    </form>
  );
}
