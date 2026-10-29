import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // لوحات الحسابات والمسارات الخاصة لا تُفهرس
      disallow: ["/dashboard", "/admin", "/onboarding", "/api", "/payments", "/suspended"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
