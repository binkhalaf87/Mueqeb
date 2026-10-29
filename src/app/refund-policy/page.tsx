import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { publicPolicyValues } from "@/lib/legal";

export const metadata: Metadata = {
  title: "سياسة الاسترداد والنزاعات",
  description: "متى وكيف يُسترد المبلغ، وكيف تُحل النزاعات في منصة مُعقّب (مسودة).",
  alternates: { canonical: "/refund-policy" },
};

export default async function RefundPolicyPage() {
  const v = await publicPolicyValues();
  return (
    <LegalPage title="سياسة الاسترداد والنزاعات" updated="2026-10-29">
      <section className="space-y-2">
        <h2>1. أين يذهب مبلغك</h2>
        <p>
          يُحفظ المبلغ المدفوع (الأتعاب + رسم الخدمة {v.client_fee_pct}%) لدى المنصة في حساب ضمان،
          ولا يُستحق للمزوّد إلا بعد تأكيدك للإنجاز أو انقضاء مهلة التأكيد.
        </p>
      </section>
      <section className="space-y-2">
        <h2>2. الإلغاء قبل بدء التنفيذ</h2>
        <p>يُسترد المبلغ المدفوع كاملاً إلى وسيلة الدفع نفسها.</p>
      </section>
      <section className="space-y-2">
        <h2>3. الإلغاء بعد بدء التنفيذ</h2>
        <p>
          يُستحق للمزوّد {v.cancel_after_start_provider_pct}% من أتعابه مقابل ما أنجزه، ويُسترد لك
          الباقي.
        </p>
      </section>
      <section className="space-y-2">
        <h2>4. تأكيد الإنجاز</h2>
        <p>
          بعد أن يسلّم المزوّد الإنجاز مع إثباته، لديك {v.delivery_confirmation_days} أيام لتأكيده
          أو الاعتراض عليه. نذكّرك قبل انتهاء المهلة بيوم. إن انقضت المهلة دون رد يكتمل الطلب
          تلقائياً ويُستحق للمزوّد صافي أتعابه.
        </p>
      </section>
      <section className="space-y-2">
        <h2>5. النزاعات</h2>
        <ol>
          <li>تعترض من صفحة الطلب خلال مهلة التأكيد مع ذكر السبب.</li>
          <li>تراجع الإدارة المحادثة والمستندات وإثبات الإنجاز وسجل الحالات.</li>
          <li>
            يصدر القرار بأحد ثلاثة: لصالح المزوّد، أو استرداد كامل لك، أو استرداد جزئي لا يتجاوز
            أتعاب المزوّد.
          </li>
          <li>تُنفّذ المبالغ وتُسجّل في دفتر الحسابات، ويصلك إشعار بالقرار.</li>
        </ol>
      </section>
      <section className="space-y-2">
        <h2>6. ما لا يُسترد عبر المنصة</h2>
        <p>
          الرسوم الحكومية لا تمر عبر المنصة، فلا تُسترد منها؛ استردادها، إن جاز، من الجهة الحكومية
          مباشرة.
        </p>
      </section>
      <section className="space-y-2">
        <h2>7. مدة الاسترداد</h2>
        <p>
          [يُستكمل بعد المراجعة القانونية والاتفاق مع بوابة الدفع: المدة المتوقعة لوصول المبلغ،
          وطريقة التواصل للاعتراض على قرار النزاع.]
        </p>
      </section>
    </LegalPage>
  );
}
