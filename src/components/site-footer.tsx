import Link from "next/link";

const LINKS = [
  { href: "/services", label: "الخدمات" },
  { href: "/providers", label: "المكاتب" },
  { href: "/terms", label: "الشروط والأحكام" },
  { href: "/privacy", label: "سياسة الخصوصية" },
  { href: "/refund-policy", label: "الاسترداد والنزاعات" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 text-sm text-muted">
        <nav aria-label="روابط الموقع" className="flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-primary">
              {l.label}
            </Link>
          ))}
        </nav>
        <p>مُعقّب — سوق لخدمات التعقيب عبر مكاتب مرخّصة.</p>
        <p>لن نطلب منك أبداً كلمة مرور أو رمز تحقق لحساباتك الحكومية.</p>
      </div>
    </footer>
  );
}
