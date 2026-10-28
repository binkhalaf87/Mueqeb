import { createClient } from "@/lib/supabase/server";
import { getThreadMessages } from "@/lib/execution/queries";
import { Chat } from "@/components/chat";

const CLOSED = ["completed", "resolved", "cancelled", "expired"];

/**
 * خيوط المحادثة للعميل: قبل الترسية خيط لكل مكتب قدّم عرضاً (أو المكتب المستهدف)،
 * وبعد الترسية خيط المكتب المختار فقط.
 */
export async function RequesterChats({
  requestId,
  status,
  currentUserId,
  awardedProviderId,
  bidders,
  targetProviderId,
}: {
  requestId: string;
  status: string;
  currentUserId: string;
  awardedProviderId: string | null;
  bidders: { providerId: string; officeName: string }[];
  targetProviderId: string | null;
}) {
  if (status === "draft") return null;
  let threads = awardedProviderId
    ? bidders.filter((b) => b.providerId === awardedProviderId)
    : bidders;

  if (threads.length === 0 && targetProviderId) {
    const supabase = await createClient();
    const { data } = await supabase
      .rpc("public_provider", { p_provider_id: targetProviderId })
      .maybeSingle();
    threads = [{ providerId: targetProviderId, officeName: data?.office_name ?? "المكتب" }];
  }
  if (threads.length === 0) return null;

  const withMessages = await Promise.all(
    threads.map(async (t) => ({
      ...t,
      messages: await getThreadMessages(requestId, t.providerId),
    })),
  );
  return (
    <div className="space-y-4">
      {withMessages.map((t) => (
        <Chat
          key={t.providerId}
          requestId={requestId}
          providerId={t.providerId}
          initialMessages={t.messages}
          currentUserId={currentUserId}
          title={`المحادثة مع ${t.officeName}`}
          closed={CLOSED.includes(status)}
        />
      ))}
    </div>
  );
}
