import { NextResponse, type NextRequest } from "next/server";
import { isAuthPath, isProtectedPath } from "@/lib/auth/routes";
import { readSession, SESSION_COOKIE } from "@/lib/auth/token";
import { sessionVersion } from "@/lib/auth/accounts";

/**
 * فحص تفاؤلي للدخول من كوكي الجلسة الموقّع.
 * التحقق النهائي من الدور والإيقاف يتم في الخادم داخل كل صفحة (requireRole).
 */
export async function proxy(request: NextRequest) {
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (!session && isProtectedPath(pathname)) {
    return redirectTo(request, "/login", pathname);
  }
  if (session && isAuthPath(pathname)) {
    // صفحتا الدخول والتسجيل فقط: تحقق من أن الجلسة ما زالت سارية (لم تتغير كلمة المرور
    // ولم يُحذف الحساب)، وإلا امسح الكوكي واعرض الصفحة بدل حلقة إعادة توجيه
    if ((await sessionVersion(session.userId)) !== session.version) {
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
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
