import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/db/server";
import { getThreadMessages } from "@/lib/execution/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * رسائل خيط (طلب، مزوّد) الأحدث من after — تستطلعها واجهة المحادثة دورياً.
 * القراءة بهوية المستخدم، فـ RLS يقصرها على أطراف الخيط والإدارة.
 */
export async function GET(request: NextRequest) {
  if (!(await getSessionUserId())) return NextResponse.json([], { status: 401 });
  const params = request.nextUrl.searchParams;
  const requestId = params.get("request") ?? "";
  const providerId = params.get("provider") ?? "";
  const after = Number(params.get("after") ?? 0);
  if (!UUID.test(requestId) || !UUID.test(providerId) || !Number.isSafeInteger(after)) {
    return NextResponse.json([], { status: 400 });
  }
  const messages = await getThreadMessages(requestId, providerId, after);
  return NextResponse.json(messages, { headers: { "cache-control": "no-store" } });
}
