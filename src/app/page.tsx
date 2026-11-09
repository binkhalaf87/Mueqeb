import Link from "next/link";
import { Card } from "@/components/ui";

/** المعاملات بلغة صاحب المنشأة، مع اسم المنصة الحكومية لكل مجموعة */
const CATEGORIES = [
  { slug: "qiwa", name: "قوى", examples: "رخص العمل، نقل خدمات العاملين وتوثيق العقود." },
  {
    slug: "gosi",
    name: "التأمينات الاجتماعية",
    examples: "تسجيل المنشأة، إضافة المشتركين وإصدار الشهادات.",
  },
  { slug: "mudad", name: "مدد", examples: "التسجيل في حماية الأجور ورفع ملفات الرواتب." },
  {
    slug: "commercial_register",
    name: "السجل التجاري",
    examples: "إصدار السجل، تعديل النشاط والتأكيد السنوي.",
  },
  { slug: "balady", name: "بلدي", examples: "إصدار وتجديد رخص المحلات وإصدار الشهادات الصحية." },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 py-6">
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
          أنجز معاملات منشأتك مع مكاتب تعقيب مرخّصة
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          تحتاج تنقل خدمات عامل، تعدّل سجلك التجاري أو تجدّد رخصة محلك؟ في مُعقّب تقدر تطلب عروض
          أسعار أو تختار مكتبًا وتطلب الخدمة منه مباشرة.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/services"
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
            data-testid="home-browse-services"
          >
            تصفّح الخدمات
          </Link>
          <Link
            href="/providers"
            className="rounded-lg border border-border bg-surface px-5 py-2.5 font-medium hover:border-primary"
          >
            تصفّح المكاتب
          </Link>
        </div>
      </section>

      <Card className="space-y-4" data-testid="home-categories">
        <h2 className="text-xl font-semibold">وش المعاملة اللي تحتاجها؟</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/services#${c.slug}`}
                className="block h-full space-y-1 rounded-lg border border-border px-4 py-3 hover:border-primary"
              >
                <span className="font-semibold text-primary">{c.name}</span>
                <span className="block text-sm">{c.examples}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/services" className="inline-block text-sm text-primary hover:underline">
          عرض جميع الخدمات ←
        </Link>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl font-semibold">اختر المكتب المناسب لمنشأتك</h2>
        <p className="text-muted">
          اطّلع على خدمات المكاتب المرخّصة وتقييماتها، وشوف السعر التقريبي والمستندات المطلوبة لكل
          خدمة.
        </p>
        <Link
          href="/providers"
          className="inline-block rounded-lg border border-border bg-surface px-5 py-2.5 font-medium hover:border-primary"
        >
          تصفّح مكاتب التعقيب
        </Link>
      </Card>

      <p className="rounded-lg bg-primary-soft px-4 py-3 text-sm">
        مُعقّب لا يطلب كلمة مرور أو رمز تحقق لحساباتك الحكومية.
      </p>
    </div>
  );
}
