"use client";

import { useActionState, useState } from "react";
import { createRequest } from "@/app/actions/requests";
import type { FormState } from "@/app/actions/auth";
import { SAUDI_CITIES } from "@/lib/cities";
import { formatHalalas } from "@/lib/money";
import { DELEGATION_LABEL, type DelegationPlatform } from "@/lib/providers/constants";
import {
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_REQUEST_ATTACHMENTS,
  type RequestMode,
} from "@/lib/requests/constants";
import { keepValuesSubmit } from "@/components/keep-values-submit";
import { Button, Card, Field, FormMessage, Select, TextArea } from "@/components/ui";

export type ServiceOption = {
  id: string;
  name: string;
  category: string;
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
  initialTitle = "",
  initialAuthority = "",
  provider,
  accounts,
}: {
  mode: RequestMode;
  options: ServiceOption[];
  initialServiceId: string;
  /** الطلب العام: عنوان وجهة مقترحان من صفحة خدمة (قابلان للتعديل) */
  initialTitle?: string;
  initialAuthority?: string;
  provider?: ProviderTarget;
  accounts: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRequest, {});
  const service = options.find((o) => o.id === initialServiceId);
  const isPublic = mode === "public";
  // فحص مبكر في المتصفح لحجم المرفقات (الخادم يتحقق أيضاً)
  const [attachmentsError, setAttachmentsError] = useState<string>();

  return (
    <form onSubmit={keepValuesSubmit(action)} className="space-y-6" noValidate>
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="mode" value={mode} />
      {provider && <input type="hidden" name="providerId" value={provider.id} />}

      <Card className="space-y-4">
        {accounts.length > 1 ? (
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">الحساب</legend>
            <div className="flex flex-wrap gap-4 pt-1 text-sm">
              {accounts.map((a, i) => (
                <label key={a.id} className="flex items-center gap-2">
                  <input type="radio" name="accountId" value={a.id} defaultChecked={i === 0} />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="accountId" value={accounts[0]?.id ?? ""} />
        )}

        {isPublic ? (
          <>
            <Field
              label="عنوان الطلب"
              name="title"
              defaultValue={initialTitle}
              maxLength={120}
              placeholder="مثال: نقل كفالة عامل من منشأة أخرى"
              hint="اكتب المعاملة التي تحتاجها بكلماتك."
              error={state.errors?.title}
            />
            <Field
              label="الجهة المعنية"
              name="authority"
              defaultValue={initialAuthority}
              maxLength={80}
              placeholder="مثال: قوى، التأمينات الاجتماعية، بلدي، وزارة التجارة"
              hint="إن لم تكن متأكداً فاكتب «غير متأكد»."
              error={state.errors?.authority}
            />
          </>
        ) : (
          <>
            <input type="hidden" name="serviceTypeId" value={initialServiceId} />
            <p>
              <span className="text-muted">الخدمة: </span>
              <strong>{service?.name}</strong>
            </p>
          </>
        )}

        <div className="space-y-2 rounded-lg bg-background p-4 text-sm" data-testid="service-info">
          {mode === "direct_listed" && provider ? (
            <p>
              السعر المعلن: <strong>{formatHalalas(provider.feeHalalas)}</strong> · المدة المتوقعة:{" "}
              {provider.durationDays} يوم
            </p>
          ) : (
            <p>تُحدد أتعاب المكتب في العرض الذي يرسله لك، مع المدة وما يشمله العمل.</p>
          )}
          <p className="text-muted">
            الرسوم الحكومية لا تُدفع عبر المنصة؛ تدفعها مباشرة عبر القناة الرسمية.
          </p>
          <p className="text-muted">
            {service && service.delegation !== "none"
              ? `تعتمد طريقة التفويض أو منح الصلاحية على الخدمة والمنصة المختصة (${DELEGATION_LABEL[service.delegation]})، ويوضحها المكتب بعد اختيار عرضه.`
              : "يوضح المكتب طريقة التفويض أو منح الصلاحية بعد اختيار عرضه."}
          </p>
        </div>

        {!isPublic && service && service.requiredDocs.length > 0 && (
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
            <p className="mt-1 text-xs text-muted">تراها المكاتب كقائمة فقط؛ لا ترفع ملفات الآن.</p>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {isPublic ? (
            <>
              <Field
                label="المدينة"
                name="city"
                list="cities"
                maxLength={40}
                autoComplete="off"
                placeholder="مثال: الرياض"
                error={state.errors?.city}
              />
              <datalist id="cities">
                {SAUDI_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          ) : (
            <Select
              label="المدينة"
              name="city"
              defaultValue={provider?.cities.length === 1 ? provider.cities[0] : ""}
              error={state.errors?.city}
            >
              <option value="">اختر المدينة…</option>
              {(provider?.cities ?? SAUDI_CITIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
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
          label={isPublic ? "وصف الطلب" : "وصف الطلب (اختياري)"}
          name="description"
          rows={4}
          maxLength={1000}
          hint="تراه المكاتب قبل اختيار العرض. لا تكتب اسمك أو أرقام تواصل أو روابط."
          error={state.errors?.description}
        />
        {isPublic && (
          <div className="space-y-1" data-testid="request-attachments">
            <label htmlFor="attachments" className="block text-sm font-medium">
              مرفقات توضيحية (اختياري، وننصح بها)
            </label>
            <p className="text-xs text-muted">
              صورة من رسالة المنصة الرسمية أو الخطاب أو النموذج تساعد المكاتب على فهم طلبك وتسعيره
              بدقة. حتى 5 ملفات (PDF أو JPG أو PNG)، والحجم معاً لا يتجاوز 4MB.
            </p>
            <input
              id="attachments"
              type="file"
              name="attachments"
              multiple
              accept="application/pdf,image/jpeg,image/png"
              aria-invalid={state.errors?.attachments || attachmentsError ? true : undefined}
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? []);
                const total = files.reduce((sum, f) => sum + f.size, 0);
                const error =
                  files.length > MAX_REQUEST_ATTACHMENTS
                    ? "خمسة مرفقات كحد أقصى."
                    : total > MAX_ATTACHMENTS_TOTAL_BYTES
                      ? "حجم المرفقات معاً يتجاوز 4MB. صغّر الملفات أو قلّل عددها."
                      : undefined;
                setAttachmentsError(error);
                if (error) e.currentTarget.value = "";
              }}
              className="w-full text-sm file:me-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
            />
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              تراها المكاتب قبل اختيار العرض. أخفِ أرقام الهوية والإقامة والأسماء وأرقام التواصل.
            </p>
            {(attachmentsError || state.errors?.attachments) && (
              <p className="text-sm text-danger">{attachmentsError ?? state.errors?.attachments}</p>
            )}
          </div>
        )}
        <TextArea
          label="ملاحظات خاصة (اختياري)"
          name="privateNotes"
          rows={3}
          maxLength={2000}
          hint="لا يراها إلا المكتب الذي تختار عرضه، بعد اختياره فقط."
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
