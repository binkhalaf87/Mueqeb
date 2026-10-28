import Link from "next/link";
import { Card } from "@/components/ui";

const SERVICES = ["قوى", "التأمينات الاجتماعية", "مدد", "السجل التجاري", "بلدي"];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 py-6">
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
          أنجز معاملات منشأتك عبر مكاتب تعقيب موثّقة
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          انشر طلبك واستقبل عروضاً مغلقة من مكاتب خدمات مرخّصة، أو اطلب الخدمة مباشرة من المكتب الذي
          تثق به. أموالك محفوظة حتى تأكيد الإنجاز.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
          >
            ابدأ الآن
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border bg-surface px-5 py-2.5 font-medium hover:border-primary"
          >
            لدي حساب
          </Link>
        </div>
      </section>

      <Card>
        <h2 className="mb-3 font-semibold">الخدمات التي نبدأ بها</h2>
        <ul className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <li key={s} className="rounded-full bg-primary-soft px-3 py-1 text-sm text-primary">
              {s}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
