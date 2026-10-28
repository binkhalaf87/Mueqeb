import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseEnv } from "@/lib/env";
import { isAuthPath, isProtectedPath } from "@/lib/auth/routes";

/**
 * يحدّث جلسة Supabase في كل طلب ويجري فحصاً تفاؤلياً للدخول.
 * التحقق النهائي من الدور يتم في الخادم داخل كل صفحة (requireRole).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = publicSupabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && isProtectedPath(pathname)) {
    return redirectWithCookies(request, response, "/login", pathname);
  }
  if (signedIn && isAuthPath(pathname)) {
    return redirectWithCookies(request, response, "/dashboard");
  }

  return response;
}

function redirectWithCookies(request: NextRequest, from: NextResponse, to: string, next?: string) {
  const target = request.nextUrl.clone();
  target.pathname = to;
  target.search = next ? `?next=${encodeURIComponent(next)}` : "";
  const redirect = NextResponse.redirect(target);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
