import type { NextConfig } from "next";

/**
 * ترويسات أمان لكل استجابة. CSP يسمح بالسكربتات المضمّنة لأن Next يحقنها لترطيب الصفحات؛
 * لا مصادر خارجية إطلاقاً (الخطوط مستضافة ذاتياً عبر next/font).
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      // صفحة الدفع المستضافة لدى Moyasar قد تُفتح بعد إرسال نموذج الدفع
      "form-action 'self' https://*.moyasar.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
