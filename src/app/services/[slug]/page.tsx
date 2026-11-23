import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { formatHalalas } from "@/lib/money";
import { getProviderStats } from "@/lib/providers/stats";
import { rankProviders } from "@/lib/providers/ranking";
import { CATEGORY_PLATFORM } from "@/lib/services/search";
import { jsonLd, siteUrl } from "@/lib/site";
import { Rating } from "@/components/rating";
import { VerifiedBadge } from "@/components/verified-badge";
import { Card } from "@/components/ui";

const SLUG = /^[a-z][a-z0-9_]{2,60}$/;
const LISTED_PROVIDERS = 5;

type ServiceType = Tables<"service_types"> & { category_name: string; category_slug: string };

/** نوع الخدمة الفعّال فقط (RLS يخفي غير الفعّال عن الزوار) */
const getService = cache(async (slug: string) => {
  if (!SLUG.test(slug)) return null;
  const db = await getDb();
  return db.maybeOne<ServiceType>(
    `select t.*, c.name_ar as category_name, c.slug as category_slug
     from public.service_types t join public.service_categories c on c.id = t.category_id
     where t.slug = $1 and t.active`,
    [slug],
  );
});

function describe(service: ServiceType) {
  return (
    service.description ||
    `${service.name_ar} عبر مكاتب التعقيب على مُعقّب: وصف الخدمة ومتطلباتها والمكاتب المتاحة لتقديمها.`
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const service = await getService((await params).slug);
  if (!service) return { title: "خدمة غير موجودة" };
  const title = `${service.name_ar} | خدمات التعقيب عبر مُعقّب`;
  const description = describe(service);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/services/${service.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ar_SA",
      url: `/services/${service.slug}`,
    },
  };
}

export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const service = await getService((await params).slug);
  if (!service) notFound();

  const db = await getDb();
  const [{ data: overview }, { data: providers }] = await Promise.all([
    db.rpc("public_service_overview", { p_service_type_id: service.id }),
    db.rpc("public_providers", { p_service_type_id: service.id }),
  ]);
  const summary = overview?.[0];
  const statsById = await getProviderStats((providers ?? []).map((p) => p.id));
  const listed = rankProviders(
    (providers ?? []).map((p) => {
      const st = statsById.get(p.id);
      return {
        ...p,
        name: p.office_name,
        avgRating: st?.avg_rating == null ? null : Number(st.avg_rating),
        reviewsCount: st?.reviews_count ?? 0,
        completedOrders: st?.completed_orders ?? 0,
        onTimePct: st?.on_time_pct ?? null,
      };
    }),
  ).slice(0, LISTED_PROVIDERS);

  const hasProviders = listed.length > 0;
  const platform = CATEGORY_PLATFORM[service.category_slug] ?? service.category_name;
  const quoteHref = `/dashboard/requester/requests/new?service=${service.id}`;
  const chooseHref = `/providers?service=${service.id}`;
  const base = siteUrl();

  // البيانات المنظمة تطابق المحتوى: السعر فقط إن وُجدت أسعار منشورة فعلاً من مكاتب
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: service.name_ar,
      description: describe(service),
      serviceType: service.category_name,
      areaServed: { "@type": "Country", name: "المملكة العربية السعودية" },
      url: `${base}/services/${service.slug}`,
      provider: { "@type": "Organization", name: "مُعقّب", url: base },
      ...(summary?.from_fee_halalas
        ? {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "SAR",
              lowPrice: (summary.from_fee_halalas / 100).toFixed(2),
              offerCount: summary.providers_count,
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الخدمات", item: `${base}/services` },
        { "@type": "ListItem", position: 2, name: service.category_name },
        {
          "@type": "ListItem",
          position: 3,
          name: service.name_ar,
          item: `${base}/services/${service.slug}`,
        },
      ],
    },
  ];

  const primaryButton =
    "inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover";
  const secondaryButton =
    "inline-block rounded-lg border border-border bg-surface px-5 py-2.5 font-medium hover:border-primary";

  return (
    <article className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />

      <nav aria-label="مسار التنقل" className="text-sm text-muted">
        <Link href="/services" className="hover:text-primary">
          الخدمات
        </Link>{" "}
        / {service.category_name}
      </nav>

      {/* 1–2: الاسم والوصف والمنصة الرسمية */}
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{service.name_ar}</h1>
        <p className="max-w-3xl text-lg text-muted" data-testid="service-description">
          {describe(service)}
        </p>
        <p className="text-sm" data-testid="service-platform">
          المنصة الرسمية ذات الصلة: <strong>{platform}</strong>. مُعقّب منصة خاصة وليس جهة حكومية.
        </p>
      </header>

      {/* 3: نطاق عمل المكتب */}
      <Card className="space-y-2">
        <h2 className="font-semibold">ما الذي يشمله عمل المكتب؟</h2>
        <p className="text-sm">
          يوضح المكتب في عرضه الإجراءات التي سيساعدك فيها، والمعلومات المطلوبة، وما يحتاج إلى إجراء
          منك أو من الموظف.
        </p>
      </Card>

      {/* 4: المتطلبات */}
      <Card className="space-y-3">
        <h2 className="font-semibold">ما الذي تحتاج إلى تجهيزه؟</h2>
        <p className="text-sm">
          تختلف المتطلبات بحسب الخدمة وحالة المنشأة والموظف. راجع متطلبات الخدمة الرسمية، واتفق مع
          المكتب على المعلومات اللازمة قبل بدء العمل.
        </p>
        {service.required_docs.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">أمثلة على معلومات أو مستندات قد تُطلب:</p>
            <ul className="list-inside list-disc space-y-1 text-sm" data-testid="required-docs">
              {service.required_docs.map((doc) => (
                <li key={doc}>{doc}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">هذه أمثلة وليست قائمة كاملة أو ثابتة لكل الحالات.</p>
          </div>
        )}
        <p className="text-sm">
          يحتاج المكتب عادةً إلى صلاحية أو تفويض على حساب المنشأة في المنصة المختصة لتنفيذ المعاملة.
          يوضح لك المكتب نوع الصلاحية المطلوبة وطريقة منحها، وتمنحها أنت من حسابك في المنصة الرسمية.
          بعض الخطوات، مثل الموافقات، ينفذها صاحب الحساب أو الموظف بنفسه.
        </p>
      </Card>

      {/* 5–6: الأتعاب والمدة */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-1">
          <h2 className="font-semibold">أتعاب المكتب</h2>
          <p className="text-lg font-bold" data-testid="service-fee">
            {summary?.from_fee_halalas
              ? `أسعار معلنة من المكاتب: من ${formatHalalas(summary.from_fee_halalas)}`
              : "تُحدد في عرض السعر بحسب نطاق العمل."}
          </p>
          <p className="text-xs text-muted">
            لا تشمل أتعاب المكتب الرسوم الحكومية. تظهر رسوم المنصة، إن وجدت، في ملخص التكلفة قبل
            تأكيد الطلب.
          </p>
        </Card>
        <Card className="space-y-1">
          <h2 className="font-semibold">المدة التقديرية</h2>
          {summary?.typical_duration_days ? (
            <p className="text-lg font-bold" data-testid="typical-duration">
              نحو {summary.typical_duration_days} أيام بحسب مدد المكاتب المعلنة
            </p>
          ) : null}
          <p className="text-xs text-muted">
            يوضح المكتب المدة التقديرية لعمله في العرض. وقد يتأثر اكتمال المعاملة بالموافقات
            والإجراءات لدى الجهات ذات العلاقة.
          </p>
        </Card>
      </div>

      {/* 7: المكاتب المتاحة */}
      <Card className="space-y-3" data-testid="top-providers">
        <h2 className="font-semibold">مكاتب تقدّم هذه الخدمة</h2>
        {!hasProviders ? (
          <p className="text-sm text-muted" data-testid="no-providers-for-service">
            لا توجد مكاتب متاحة لهذه الخدمة حاليًا.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {listed.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/providers/${p.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:text-primary"
                >
                  <span className="font-medium">{p.office_name}</span>
                  <VerifiedBadge />
                  <span className="text-sm text-muted">{p.cities.join("، ")}</span>
                  <Rating
                    value={p.avgRating}
                    count={p.avgRating == null ? undefined : p.reviewsCount}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 8: الإجراء بحسب التوافر */}
      <div className="flex flex-wrap justify-center gap-3" data-testid="service-actions">
        {hasProviders ? (
          <>
            <Link href={quoteHref} className={primaryButton} data-testid="request-now">
              اطلب عرض سعر
            </Link>
            <Link href={chooseHref} className={secondaryButton}>
              اختر مكتبًا
            </Link>
          </>
        ) : (
          <Link href="/services" className={secondaryButton}>
            تصفّح خدمات أخرى
          </Link>
        )}
      </div>
    </article>
  );
}
