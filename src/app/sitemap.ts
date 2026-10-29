import type { MetadataRoute } from "next";
import { ANON, dbFor } from "@/lib/db/core";
import { siteUrl } from "@/lib/site";

// تُبنى عند الطلب: القاعدة غير متاحة وقت البناء، والخدمات والمكاتب تتغير
export const dynamic = "force-dynamic";

/** خريطة الموقع: الصفحات العامة، وكل نوع خدمة فعّال، وصفحات المكاتب المعتمدة (بصلاحيات الزائر) */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const db = dbFor(ANON);
  const [services, providers] = await Promise.all([
    db.query<{ slug: string }>(
      "select slug from public.service_types where active order by sort_order",
    ),
    db.rpc("public_providers", {}),
  ]);
  const staticPages = ["", "/services", "/providers", "/terms", "/privacy", "/refund-policy"];
  return [
    ...staticPages.map((path) => ({
      url: `${base}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
    })),
    ...services.map((s) => ({
      url: `${base}/services/${s.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...(providers.data ?? []).map((p) => ({
      url: `${base}/providers/${p.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
