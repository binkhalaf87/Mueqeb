"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19 يعيد ضبط النموذج بعد تنفيذ action={...}. هذا المعالج يستدعي الـ action يدوياً
 * فتبقى القيم المُدخلة عند ظهور أخطاء التحقق.
 */
export function keepValuesSubmit(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // submitter يضيف name/value للزر المضغوط (مثل action=approve)
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
}
