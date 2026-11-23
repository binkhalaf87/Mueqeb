import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "مُعقّب | خدمات التعقيب ومكاتب الخدمات العامة للمنشآت" },
  description:
    "ابحث عن خدمات التعقيب لمنشأتك، وتعرّف على المكاتب المتاحة لخدمات قوى والتأمينات ومدد والسجل التجاري وبلدي.",
  alternates: { canonical: "/" },
};

/** مجموعات الخدمات كما في الكتالوج (المعرّف = قسمها في دليل الخدمات) */
const CATEGORIES = [
  {
    slug: "qiwa",
    title: "خدمات قوى",
    text: "رخص العمل، ونقل خدمات الموظفين، وتغيير المهن، وعقود العمل.",
    link: "عرض خدمات قوى",
  },
  {
    slug: "gosi",
    title: "خدمات التأمينات الاجتماعية",
    text: "تسجيل المنشآت والمشتركين، واستبعاد المشتركين، وإصدار شهادات المنشأة.",
    link: "عرض خدمات التأمينات",
  },
  {
    slug: "mudad",
    title: "حماية الأجور عبر مدد",
    text: "التسجيل في برنامج حماية الأجور ورفع ملف الأجور.",
    link: "عرض خدمات مدد",
  },
  {
    slug: "commercial_register",
    title: "خدمات السجل التجاري",
    text: "قيد السجل التجاري، وتعديل الأنشطة، والتأكيد السنوي للبيانات.",
    link: "عرض خدمات السجل التجاري",
  },
  {
    slug: "balady",
    title: "الرخص التجارية والشهادات الصحية",
    text: "إصدار وتجديد الرخص التجارية، وإجراءات إصدار الشهادات الصحية عبر بلدي.",
    link: "عرض خدمات بلدي",
  },
];

const COSTS = [
  { label: "أتعاب المكتب", text: "مقابل نطاق العمل الموضح في العرض." },
  { label: "رسوم المنصة", text: "تُعرض ضمن ملخص التكلفة قبل الدفع." },
  { label: "الرسوم الحكومية", text: "تُسدد عبر القنوات الرسمية، وفق الخدمة." },
];

const STEPS = [
  { title: "حدّد معاملتك", text: "اختر الخدمة وأضف المعلومات اللازمة لفهم طلبك." },
  {
    title: "راجع العرض",
    text: "راجع نطاق العمل وأتعاب المكتب والمدة التقديرية قبل الاختيار. قارن العروض المتاحة واختر المكتب المناسب.",
  },
  {
    title: "تابع طلبك",
    text: "استكمل المتطلبات وتابع التحديثات ونتيجة العمل من صفحة الطلب.",
  },
];

const FAQ = [
  {
    q: "هل مُعقّب جهة حكومية؟",
    a: "مُعقّب منصة خاصة تربط طالبي خدمات التعقيب بالمكاتب التي تقدّمها. تخضع المعاملات لمتطلبات الجهة الحكومية المختصة.",
  },
  {
    q: "هل أتعاب المكتب تشمل الرسوم الحكومية؟",
    a: "أتعاب المكتب مقابل عمله على الطلب. راجع عرض السعر لمعرفة أتعاب المكتب ورسوم المنصة، والرسوم الحكومية التي تُسدد عبر القنوات الرسمية.",
  },
  {
    q: "هل يمكن تنفيذ المعاملة بنفسي؟",
    a: "يمكن تنفيذ كثير من الخدمات مباشرة عبر المنصات الرسمية. ويمكنك الاستعانة بمكتب للمساعدة في الإجراءات والمتابعة ضمن نطاق العمل المتفق عليه.",
  },
  {
    q: "هل قبول المعاملة مضمون؟",
    a: "قبول المعاملة ونتيجتها يخضعان لاشتراطات الجهة المختصة وحالة الطلب. لا يضمن اختيار المكتب موافقة الجهة الحكومية.",
  },
  {
    q: "كم تستغرق الخدمة؟",
    a: "تختلف المدة بحسب نوع المعاملة واكتمال المتطلبات والإجراءات المرتبطة بها. يوضح المكتب المدة التقديرية لعمله ضمن العرض.",
  },
  {
    q: "كيف يحصل المكتب على صلاحية تنفيذ معاملتي؟",
    a: "يوضح المكتب نوع الصلاحية أو التفويض الذي تحتاجه معاملتك، وتمنحه أنت من حسابك في المنصة الرسمية المختصة، مثل قوى أو بلدي أو منصة الأعمال، ثم تكمل الخطوات التي تخصك بنفسك.",
  },
];

const primaryButton =
  "inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover";
const secondaryButton =
  "inline-block rounded-lg border border-border bg-surface px-5 py-2.5 font-medium hover:border-primary";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 py-6">
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
          ابحث عن مكتب تعقيب لمعاملات منشأتك
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          تحتاج نقل خدمات موظف، أو تأكيد بيانات سجلك التجاري، أو تجديد رخصتك التجارية؟ تصفّح الخدمة
          وتعرّف على المكاتب التي تقدّمها، ثم اختر ما يناسب احتياج منشأتك.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/services" className={primaryButton} data-testid="home-browse-services">
            تصفّح خدمات التعقيب
          </Link>
          <Link href="/providers" className={secondaryButton}>
            ابحث عن مكتب
          </Link>
        </div>
        <p className="text-sm text-muted">
          تعرّف على أتعاب المكتب وما يشمله العرض قبل تأكيد الطلب.
        </p>
      </section>

      <section className="space-y-4" data-testid="home-categories">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">ما الخدمة التي تحتاجها؟</h2>
          <p className="text-muted">ابدأ بالمعاملة التي تريد المساعدة فيها.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Card className="flex h-full flex-col gap-2">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="flex-1 text-sm text-muted">{c.text}</p>
                <Link href={`/services#${c.slug}`} className="text-sm text-primary hover:underline">
                  {c.link} ←
                </Link>
              </Card>
            </li>
          ))}
        </ul>
        <Link href="/services" className="inline-block text-sm text-primary hover:underline">
          عرض جميع الخدمات ←
        </Link>
      </section>

      <Card className="space-y-3">
        <h2 className="text-xl font-semibold">اختر المكتب حسب الخدمة التي تحتاجها</h2>
        <p className="text-muted">
          تعرّف على خدمات المكتب ومدينة عمله والتفاصيل المتاحة في ملفه قبل تقديم طلبك. راجع أتعاب
          المكتب وتقييمات العملاء المتاحة قبل الاختيار.
        </p>
        <Link href="/providers" className={secondaryButton}>
          تصفّح مكاتب التعقيب
        </Link>
      </Card>

      <section className="space-y-4" data-testid="home-costs">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">اعرف ما تدفعه ولمن</h2>
          <p className="max-w-3xl text-muted">
            أتعاب المكتب هي مقابل عمله على طلبك، وتختلف عن الرسوم الحكومية. راجع تفاصيل العرض وأي
            رسوم للمنصة قبل تأكيد الطلب.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {COSTS.map((c) => (
            <Card key={c.label} className="space-y-1">
              <dt className="font-semibold">{c.label}</dt>
              <dd className="text-sm text-muted">{c.text}</dd>
            </Card>
          ))}
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">من تحديد الخدمة إلى متابعة الطلب</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full space-y-1">
                <p className="text-sm font-semibold text-primary">الخطوة {i + 1}</p>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted">{s.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3" data-testid="home-faq">
        <h2 className="text-xl font-semibold">الأسئلة الشائعة</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer font-medium marker:text-primary">{f.q}</summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <Card className="space-y-3 text-center">
        <h2 className="text-xl font-semibold">ابدأ بالخدمة التي تحتاجها</h2>
        <p className="text-muted">تصفّح خدمات التعقيب وتعرّف على المكاتب المتاحة لمعاملتك.</p>
        <Link href="/services" className={primaryButton}>
          تصفّح الخدمات
        </Link>
      </Card>
    </div>
  );
}
