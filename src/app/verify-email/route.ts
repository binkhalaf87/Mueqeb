import { NextResponse, type NextRequest } from "next/server";
import { markEmailVerified } from "@/lib/auth/accounts";
import { consumeToken } from "@/lib/auth/one-time-tokens";
import { getSessionUserId } from "@/lib/db/server";

/** رابط تأكيد البريد: يستهلك الرمز مرة واحدة ثم يعيد المستخدم لحسابه (أو للدخول) */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const owner = await consumeToken(token, "email_verify");
  const verified = owner ? await markEmailVerified(owner.userId, owner.email) : false;

  const signedIn = owner !== null && (await getSessionUserId()) === owner.userId;
  const path = !verified
    ? "/verify-email/invalid"
    : signedIn
      ? "/dashboard/account?verified=1"
      : "/login?verified=1";
  const response = NextResponse.redirect(
    new URL(path, process.env.APP_URL || request.nextUrl.origin),
  );
  response.headers.set("cache-control", "no-store");
  return response;
}
