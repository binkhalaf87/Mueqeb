import { getDb } from "@/lib/db/server";
import type { Enums, Json, Tables } from "@/lib/db/types";
import { getRequestDocuments } from "@/lib/execution/queries";
import { formatDateTime, timeLeft } from "@/lib/format";
import { formatHalalas } from "@/lib/money";
import { confirmCompletion, confirmDelegation } from "@/app/actions/execution";
import { ActionButton } from "@/components/action-button";
import { RequestDocumentsList } from "@/components/request-documents";
import { UploadRequestDocument } from "@/components/upload-request-document";
import { Badge, Card } from "@/components/ui";
import { DisputeForm } from "./dispute-form";

const DECISION_LABEL = {
  provider: "لصالح المكتب",
  full_refund: "استرداد كامل",
  partial_refund: "استرداد جزئي",
} as const;

/** مراحل ما بعد الدفع من جهة العميل: التفويض، المستندات، المتابعة، التأكيد أو الاعتراض */
export async function RequesterExecutionPanel({ requestId }: { requestId: string }) {
  const db = await getDb();
  const request = await db.maybeOne<{
    status: Enums<"request_status">;
    delegation_confirmed_at: string | null;
    started_at: string | null;
    due_at: string | null;
    delivered_at: string | null;
    delivery_note: string | null;
    is_late: boolean;
    delegation_platform: Enums<"delegation_platform"> | null;
    required_docs: string[] | null;
  }>(
    `select r.status, r.delegation_confirmed_at, r.started_at, r.due_at, r.delivered_at,
            r.delivery_note, r.is_late, t.delegation_platform, t.required_docs
     from public.service_requests r left join public.service_types t on t.id = r.service_type_id
     where r.id = $1`,
    [requestId],
  );
  if (
    !request ||
    !["awaiting_client", "in_progress", "delivered", "disputed", "resolved", "completed"].includes(
      request.status,
    )
  ) {
    return null;
  }

  const platform = request.delegation_platform ?? "none";
  const [guide, documents, dispute, confirmDays] = await Promise.all([
    db.maybeOne<{ title: string; steps: string[] }>(
      "select title, steps from public.delegation_guides where platform = $1",
      [platform],
    ),
    getRequestDocuments(requestId),
    db.maybeOne<Tables<"disputes">>("select * from public.disputes where request_id = $1", [
      requestId,
    ]),
    db.maybeOne<{ value: Json }>(
      "select value from public.settings where key = 'delivery_confirmation_days'",
    ),
  ]);
  const clientDocs = documents.filter((d) => d.kind === "client_document");
  const proofs = documents.filter((d) => d.kind === "delivery_proof");
  const canUpload = request.status === "awaiting_client" || request.status === "in_progress";

  return (
    <div className="space-y-6">
      {request.status === "awaiting_client" && guide && (
        <Card className="space-y-3" data-testid="delegation-guide">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">الخطوة 1: {guide.title}</h2>
            {request.delegation_confirmed_at && <Badge tone="success">تم منح التفويض</Badge>}
          </div>
          <ol className="list-decimal space-y-1 ps-5 text-sm">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="rounded-lg bg-background px-3 py-2 text-sm">
            🔒 لن نطلب منك أبداً كلمة مرور أو رمز تحقق. التفويض يتم من حسابك في المنصة الرسمية فقط،
            ولا تشارك أي رمز يصلك مع أحد.
          </p>
          {!request.delegation_confirmed_at && (
            <ActionButton
              action={confirmDelegation}
              fields={{ requestId }}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
            >
              {platform === "none" ? "تم، المستندات جاهزة" : "تم منح التفويض"}
            </ActionButton>
          )}
        </Card>
      )}

      {(canUpload || clientDocs.length > 0) && (
        <Card className="space-y-3" data-testid="client-documents">
          <h2 className="font-semibold">
            {request.status === "awaiting_client" ? "الخطوة 2: " : ""}مستنداتك للمكتب
          </h2>
          <p className="text-sm text-muted">لا يطّلع عليها إلا المكتب المختار والإدارة.</p>
          <RequestDocumentsList documents={clientDocs} emptyText="لم ترفع مستندات بعد." />
          {canUpload && (
            <UploadRequestDocument
              requestId={requestId}
              labels={request.required_docs ?? []}
              testId="upload-client-document"
            />
          )}
        </Card>
      )}

      {request.status === "in_progress" && (
        <Card className="text-sm" data-testid="execution-status">
          <p>
            بدأ المكتب التنفيذ {request.started_at && `في ${formatDateTime(request.started_at)}`}.
            {request.due_at && ` الموعد المتوقع: ${formatDateTime(request.due_at)}.`}
          </p>
          {request.is_late && (
            <p className="mt-1">
              <Badge tone="danger">متأخر</Badge> تجاوز المكتب المدة المتفق عليها.
            </p>
          )}
          {!request.is_late && request.due_at && timeLeft(request.due_at) && (
            <p className="mt-1 text-muted">المتبقي: {timeLeft(request.due_at)}</p>
          )}
        </Card>
      )}

      {request.delivered_at && (
        <Card className="space-y-3" data-testid="delivery">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">التسليم</h2>
            {request.is_late && <Badge tone="danger">سُلّم متأخراً</Badge>}
          </div>
          <p className="text-sm whitespace-pre-line">{request.delivery_note}</p>
          <RequestDocumentsList documents={proofs} emptyText="—" testId="delivery-proofs" />
          {request.status === "delivered" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-sm text-muted">
                راجع الإنجاز ثم أكّده. إن لم ترد خلال {String(confirmDays?.value ?? 3)} أيام من
                التسليم يُعتبر الطلب مكتملاً تلقائياً.
              </p>
              <ActionButton
                action={confirmCompletion}
                fields={{ requestId }}
                confirmText="تأكيد إنجاز الخدمة؟ سيُحوَّل مستحق المكتب."
                className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
              >
                تأكيد الإنجاز
              </ActionButton>
              <DisputeForm requestId={requestId} />
            </div>
          )}
        </Card>
      )}

      {request.status === "in_progress" && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">مشكلة في التنفيذ؟ اعترض</summary>
          <div className="mt-2">
            <DisputeForm requestId={requestId} />
          </div>
        </details>
      )}

      {dispute && (
        <Card className="space-y-1 text-sm" data-testid="dispute">
          <h2 className="font-semibold">الاعتراض</h2>
          <p>
            <span className="text-muted">السبب: </span>
            {dispute.reason}
          </p>
          {dispute.decision ? (
            <p>
              <span className="text-muted">قرار الإدارة: </span>
              {DECISION_LABEL[dispute.decision]}
              {dispute.decision !== "provider" &&
                ` — استُرد لك ${formatHalalas(dispute.refund_halalas ?? 0)}`}
              {dispute.decision_note && ` (${dispute.decision_note})`}
            </p>
          ) : (
            <p className="text-muted">قيد مراجعة الإدارة. المبلغ محفوظ حتى القرار.</p>
          )}
        </Card>
      )}
    </div>
  );
}
