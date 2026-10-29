import { NextResponse, type NextRequest } from "next/server";
import { isAuthPath, isProtectedPath } from "@/lib/auth/routes";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * فحص تفاؤلي للدخول من كوكي الجلسة الموقّع.
 * التحقق النهائي من الدور والإيقاف يتم في الخادم داخل كل صفحة (requireRole).
 */
export async function proxy(request: NextRequest) {
  const signedIn = Boolean(await verifySession(request.cookies.get(SESSION_COOKIE)?.value));
  const { pathname } = request.nextUrl;

  if (!signedIn && isProtectedPath(pathname)) {
    return redirectTo(request, "/login", pathname);
  }
  if (signedIn && isAuthPath(pathname)) {
    return redirectTo(request, "/dashboard");
  }
  return NextResponse.next();
}

/**
 * إعادة التوجيه على نطاق الواجهة العام (APP_URL، أي Vercel أمام خادم Railway) إن حُدد،
 * فلا يُحوَّل المتصفح إلى نطاق الخادم الداخلي.
 */
function redirectTo(request: NextRequest, to: string, next?: string) {
  const target = new URL(to, process.env.APP_URL || request.nextUrl.origin);
  if (next) target.searchParams.set("next", next);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
