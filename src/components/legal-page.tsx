import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/** صفحة سياسة: تنبيه المسودة دائماً في الأعلى حتى تعتمدها مراجعة قانونية */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <p
        role="note"
        data-testid="legal-draft-notice"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
      >
        <strong>مسودة غير نهائية:</strong> هذا النص مسودة أولية لم تخضع لمراجعة قانونية، ولا يُعتمد
        عليه قبل مراجعته واعتماده من مستشار قانوني مرخّص في المملكة العربية السعودية.
      </p>
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted">آخر تحديث للمسودة: {updated}</p>
      </header>
      <Card className="space-y-5 leading-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ms-5 [&_ol]:list-decimal [&_ul]:list-disc">
        {children}
      </Card>
    </article>
  );
}
