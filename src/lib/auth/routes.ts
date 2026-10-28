export const ROLES = ["requester", "provider", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HOME: Record<Role, string> = {
  requester: "/dashboard/requester",
  provider: "/dashboard/provider",
  admin: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  requester: "طالب خدمة",
  provider: "مزوّد خدمة",
  admin: "الإدارة",
};

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/onboarding"];
const AUTH_PATHS = ["/login", "/signup"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

export function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** الصفحة الرئيسية للمستخدم حسب دوره؛ بلا دور = شاشة اختيار المسار */
export function homePathForRole(role: Role | null | undefined) {
  return role ? ROLE_HOME[role] : "/onboarding";
}

/** يقبل فقط مسارات داخلية نسبية لمنع إعادة التوجيه لموقع خارجي */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

export type NavItem = { href: string; label: string };

export function navForRole(role: Role | null | undefined): NavItem[] {
  switch (role) {
    case "requester":
      return [{ href: ROLE_HOME.requester, label: "طلباتي" }];
    case "provider":
      return [{ href: ROLE_HOME.provider, label: "لوحة المزوّد" }];
    case "admin":
      return [{ href: ROLE_HOME.admin, label: "لوحة الإدارة" }];
    default:
      return [{ href: "/onboarding", label: "إكمال التسجيل" }];
  }
}
