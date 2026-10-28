import Link from "next/link";

const ADMIN_NAV = [
  { href: "/admin", label: "المؤشرات" },
  { href: "/admin/providers", label: "توثيق المزوّدين" },
  { href: "/admin/disputes", label: "النزاعات" },
  { href: "/admin/payables", label: "المستحقات" },
  { href: "/admin/ledger", label: "الدفتر" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/services", label: "الخدمات" },
  { href: "/admin/settings", label: "الإعدادات" },
  { href: "/admin/reports", label: "البلاغات" },
];

/** تنقّل لوحة الإدارة. التحقق من الدور يتم في كل صفحة (requireRole). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-6">
      <nav aria-label="أقسام الإدارة" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
