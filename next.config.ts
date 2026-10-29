import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // مستندات المزوّد حتى 5MB + هامش multipart
      bodySizeLimit: "6mb",
      // نطاقات الواجهة المسموح لها باستدعاء Server Actions (Vercel أمام خادم Railway)
      allowedOrigins: process.env.SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
