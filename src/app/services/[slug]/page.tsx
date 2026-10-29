import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { formatHalalas } from "@/lib/money";
import { DELEGATION_LABEL } from "@/lib/providers/constants";
import { getProviderStats } from "@/lib/providers/stats";
import { rankProviders } from "@/lib/providers/ranking";
import { jsonLd, siteUrl } from "@/lib/site";
import { Rating } from "@/components/rating";
import { VerifiedBadge } from "@/components/verified-badge";
import { Card } from "@/components/ui";

const SLUG = /^[a-z][a-z0-9_]{2,60}$/;
const TOP_PROVIDERS = 5;

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
    `${service.name_ar} عبر مكاتب تعقيب مرخّصة وموثّقة في السعودية: المستندات المطلوبة، والسعر الاسترشادي، والمدة المعتادة.`
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const service = await getService((await params).slug);
  if (!service) return { title: "خدمة غير موجودة" };
  const title = `${service.name_ar} — ${service.category_name}`;
  const description = `${describe(service)} السعر الاسترشادي ${formatHalalas(service.guide_min_halalas)} – ${formatHalalas(service.guide_max_halalas)}.`;
  return {
    title,
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
  const top = rankProviders(
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
  ).slice(0, TOP_PROVIDERS);

  const requestHref = `/dashboard/requester/requests/new?service=${service.id}`;
  const base = siteUrl();
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
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "SAR",
        lowPrice: (service.guide_min_halalas / 100).toFixed(2),
        highPrice: (service.guide_max_halalas / 100).toFixed(2),
        ...(summary?.providers_count ? { offerCount: summary.providers_count } : {}),
      },
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

      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{service.name_ar}</h1>
        <p className="max-w-3xl text-lg text-muted" data-testid="service-description">
          {describe(service)}
        </p>
        <Link
          href={requestHref}
          className="inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover"
          data-testid="request-now"
        >
          اطلب الآن
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="space-y-1">
          <h2 className="text-sm text-muted">النطاق الاسترشادي للأتعاب</h2>
          <p className="text-xl font-bold" data-testid="guide-range">
            {formatHalalas(service.guide_min_halalas)} – {formatHalalas(service.guide_max_halalas)}
          </p>
          <p className="text-xs text-muted">
            لا يشمل الرسوم الحكومية، وتدفعها بنفسك عبر القناة الرسمية.
          </p>
        </Card>
        <Card className="space-y-1">
          <h2 className="text-sm text-muted">المدة المعتادة</h2>
          <p className="text-xl font-bold" data-testid="typical-duration">
            {summary?.typical_duration_days
              ? `${summary.typical_duration_days} أيام عمل تقريباً`
              : "—"}
          </p>
          <p className="text-xs text-muted">الوسيط من مدد المكاتب المعتمدة المعلنة.</p>
        </Card>
        <Card className="space-y-1">
          <h2 className="text-sm text-muted">مكاتب معتمدة تقدّمها</h2>
          <p className="text-xl font-bold">{summary?.providers_count ?? 0}</p>
          {summary?.from_fee_halalas ? (
            <p className="text-xs text-muted">
              أسعار معلنة تبدأ من {formatHalalas(summary.from_fee_halalas)}
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">المستندات المطلوبة عادةً</h2>
        {service.required_docs.length ? (
          <ul className="list-inside list-disc space-y-1" data-testid="required-docs">
            {service.required_docs.map((doc) => (
              <li key={doc}>{doc}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">يحددها المكتب حسب حالتك.</p>
        )}
        <p className="text-sm">
          التفويض:{" "}
          {service.delegation_platform === "none"
            ? DELEGATION_LABEL.none
            : `تمنح المكتب تفويضاً عبر ${DELEGATION_LABEL[service.delegation_platform]} بعد الدفع، والمنصة تعرض لك الخطوات.`}
        </p>
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
          لن يطلب منك المكتب ولا المنصة أبداً كلمة مرور أو رمز تحقق لحساباتك الحكومية.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">كيف تتم الخدمة عبر مُعقّب</h2>
        <ol className="list-inside list-decimal space-y-1 text-sm">
          <li>انشر طلبك فتصلك عروض مغلقة من المكاتب المعتمدة، أو اطلب من مكتب بعينه.</li>
          <li>اختر العرض وادفع؛ المبلغ محفوظ لدى المنصة حتى تأكيدك للإنجاز.</li>
          <li>امنح التفويض الرسمي وارفع المستندات، ويبدأ المكتب التنفيذ.</li>
          <li>يسلّم المكتب الإنجاز بإثبات، فتؤكده أو تعترض خلال 3 أيام.</li>
        </ol>
      </Card>

      <Card className="space-y-3" data-testid="top-providers">
        <h2 className="font-semibold">أفضل المكاتب لهذه الخدمة</h2>
        {!top.length ? (
          <p className="text-sm text-muted">
            لا توجد مكاتب معتمدة لهذه الخدمة بعد. انشر طلبك وسنعرضه عليها.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {top.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/providers/${p.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:text-primary"
                >
                  <span className="font-medium">{p.office_name}</span>
                  <VerifiedBadge />
                  <span className="text-sm text-muted">{p.cities.join("، ")}</span>
                  {p.avgRating != null && <Rating value={p.avgRating} count={p.reviewsCount} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/providers?service=${service.id}`}
          className="text-sm text-primary hover:underline"
        >
          كل المكاتب لهذه الخدمة ←
        </Link>
      </Card>

      <div className="text-center">
        <Link
          href={requestHref}
          className="inline-block rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary-hover"
        >
          اطلب {service.name_ar} الآن
        </Link>
      </div>
    </article>
  );
}
