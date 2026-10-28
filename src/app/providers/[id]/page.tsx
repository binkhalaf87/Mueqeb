import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { formatHalalas } from "@/lib/money";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getProviderStats } from "@/lib/providers/stats";
import { Rating } from "@/components/rating";
import { VerifiedBadge } from "@/components/verified-badge";
import { Card } from "@/components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** يعيد المزوّد المعتمد فقط؛ غير المعتمد غير موجود بالنسبة للعامة */
const getPublicProvider = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_provider", { p_provider_id: id }).maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: PageProps<"/providers/[id]">): Promise<Metadata> {
  const provider = await getPublicProvider((await params).id);
  return { title: provider?.office_name ?? "مزوّد غير موجود" };
}

export default async function PublicProviderPage({ params }: PageProps<"/providers/[id]">) {
  const { id } = await params;
  const provider = await getPublicProvider(id);
  if (!provider) notFound();

  const supabase = await createClient();
  const [{ data: services }, user, statsById, { data: reviews }] = await Promise.all([
    supabase.rpc("public_provider_services", { p_provider_id: provider.id }),
    getCurrentUser(),
    getProviderStats([provider.id]),
    supabase.rpc("provider_reviews", { p_provider_id: provider.id }),
  ]);
  const stats = statsById.get(provider.id);
  // أزرار الطلب لطالب الخدمة؛ والزائر يُدعى للدخول
  const canRequest = !user || user.role === "requester";
  const requestHref = (mode: string, serviceTypeId: string) => {
    const target = `/dashboard/requester/requests/new?mode=${mode}&provider=${provider.id}&service=${serviceTypeId}`;
    return user ? target : `/login?next=${encodeURIComponent(target)}`;
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{provider.office_name}</h1>
          <VerifiedBadge />
        </div>
        <p className="text-muted">يخدم: {provider.cities.join("، ")}</p>
        {provider.bio && <p className="max-w-3xl whitespace-pre-line">{provider.bio}</p>}
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5" data-testid="provider-stats">
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-sm text-muted">التقييم</p>
          <Rating value={stats?.avg_rating} count={stats?.reviews_count} testId="provider-rating" />
        </Card>
        <Stat label="الطلبات المنجزة" value={String(stats?.completed_orders ?? 0)} />
        <Stat
          label="الالتزام بالموعد"
          value={stats?.on_time_pct == null ? "—" : `${stats.on_time_pct}%`}
          hint={stats?.late_orders ? `${stats.late_orders} طلب متأخر` : undefined}
        />
        <Stat
          label="متوسط وقت الرد"
          value={
            stats?.avg_response_minutes == null ? "—" : formatDuration(stats.avg_response_minutes)
          }
          hint="على الطلبات العامة"
        />
        <Stat
          label="نسبة النزاعات"
          value={stats?.dispute_pct == null ? "—" : `${stats.dispute_pct}%`}
        />
      </div>

      {stats?.avg_rating != null && (
        <Card className="space-y-2" data-testid="rating-breakdown">
          <h2 className="font-semibold">تفاصيل التقييم</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["السرعة", stats.avg_speed],
              ["الدقة", stats.avg_accuracy],
              ["التواصل", stats.avg_communication],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center gap-2">
                <dt className="text-muted">{label}</dt>
                <dd>
                  <Rating value={value as number} />
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 font-semibold">الخدمات والأسعار</h2>
        {!services?.length ? (
          <p className="text-sm text-muted">لا توجد خدمات معروضة حالياً.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="provider-services">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.service_name}</p>
                  <p className="text-sm text-muted">{s.category_name}</p>
                  {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                </div>
                <div className="text-end text-sm">
                  <p>
                    يبدأ من <strong>{formatHalalas(s.fee_halalas)}</strong>
                  </p>
                  <p className="text-muted">خلال {s.duration_days} يوم تقريباً</p>
                </div>
                {canRequest && (
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-col">
                    <Link
                      href={requestHref("direct_listed", s.service_type_id)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-primary-hover"
                    >
                      اطلب بالسعر المعلن
                    </Link>
                    <Link
                      href={requestHref("direct_quote", s.service_type_id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-center text-sm hover:border-primary"
                    >
                      اطلب عرضاً خاصاً
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          الأسعار أتعاب المكتب فقط. الرسوم الحكومية تُدفع مباشرة عبر القنوات الرسمية.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">آراء العملاء</h2>
        {!reviews?.length ? (
          <p className="text-sm text-muted">لا توجد تقييمات منشورة بعد.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="provider-reviews">
            {reviews.map((r) => (
              <li key={r.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <Rating value={(r.speed + r.accuracy + r.communication) / 3} />
                  <span className="text-muted">
                    {r.service_name} · {formatDateTime(r.created_at)}
                  </span>
                </div>
                <p className="text-muted">
                  السرعة {r.speed} · الدقة {r.accuracy} · التواصل {r.communication}
                </p>
                {r.comment && <p>{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          تقييمات من عملاء أكملوا طلبات مدفوعة عبر المنصة فقط. تظهر بعد أن يقيّم الطرفان أو تمر 7
          أيام.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}
