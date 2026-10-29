/** العنوان العام للموقع (نطاق الواجهة) لروابط canonical وsitemap وschema.org */
export function siteUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** JSON-LD آمن داخل <script>: يمنع إغلاق الوسم أو حقن HTML من النصوص */
export function jsonLd(data: unknown) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
