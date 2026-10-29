import { getDb } from "@/lib/db/server";
import type { Tables } from "@/lib/db/types";
import { formatDateTime } from "@/lib/format";
import { Rating } from "@/components/rating";
import { Card } from "@/components/ui";
import { ReviewForm } from "./review-form";

/**
 * التقييم المتبادل لطلب مكتمل. RLS يعيد تقييمي دائماً، وتقييم الطرف الآخر فقط بعد الكشف
 * (يقيّم الطرفان أو تمر 7 أيام).
 */
export async function ReviewsSection({
  requestId,
  role,
}: {
  requestId: string;
  role: "requester" | "provider";
}) {
  const db = await getDb();
  const request = await db.maybeOne<{
    status: string;
    payment_status: string | null;
    settlement: string | null;
  }>(
    `select r.status, o.payment_status, o.settlement
     from public.service_requests r left join public.orders o on o.request_id = r.id
     where r.id = $1`,
    [requestId],
  );
  const reviewable =
    request?.status === "completed" &&
    request.payment_status === "paid" &&
    request.settlement === "completed";
  if (!reviewable) return null;

  const [reviews, { data: revealed }] = await Promise.all([
    db.query<Tables<"reviews">>("select * from public.reviews where request_id = $1", [requestId]),
    db.rpc("reviews_revealed", { p_request_id: requestId }),
  ]);
  const mine = reviews.find((r) => r.reviewer_role === role);
  const theirs = reviews.find((r) => r.reviewer_role !== role);

  return (
    <Card className="space-y-4" data-testid="reviews-section">
      <h2 className="font-semibold">التقييم</h2>

      {mine ? (
        <div className="space-y-1 text-sm" data-testid="my-review">
          <p className="font-medium">تقييمك ({formatDateTime(mine.created_at)})</p>
          {role === "requester" ? (
            <p>
              السرعة {mine.speed} · الدقة {mine.accuracy} · التواصل {mine.communication}
              {mine.comment && ` — «${mine.comment}»`}
            </p>
          ) : (
            <p>
              وضوح الطلب {mine.request_clarity} · سرعة تسليم المستندات {mine.documents_speed}
            </p>
          )}
          {!revealed && (
            <p className="text-muted" data-testid="review-pending">
              سيظهر تقييمك وتقييم الطرف الآخر معاً بعد أن يقيّم، أو بعد مرور 7 أيام على الإكمال.
            </p>
          )}
        </div>
      ) : (
        <ReviewForm requestId={requestId} role={role} />
      )}

      {revealed && theirs && (
        <div className="space-y-1 border-t border-border pt-3 text-sm" data-testid="their-review">
          {role === "requester" ? (
            <>
              <p className="font-medium">تقييم المكتب لك</p>
              <p>
                وضوح الطلب {theirs.request_clarity} · سرعة تسليم المستندات {theirs.documents_speed}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">تقييم العميل لك</p>
              <Rating
                value={
                  ((theirs.speed ?? 0) + (theirs.accuracy ?? 0) + (theirs.communication ?? 0)) / 3
                }
              />
              <p>
                السرعة {theirs.speed} · الدقة {theirs.accuracy} · التواصل {theirs.communication}
              </p>
              {theirs.comment && <p>«{theirs.comment}»</p>}
            </>
          )}
        </div>
      )}
      {revealed && !theirs && mine && (
        <p className="text-sm text-muted">لم يقيّم الطرف الآخر خلال المهلة.</p>
      )}
    </Card>
  );
}
