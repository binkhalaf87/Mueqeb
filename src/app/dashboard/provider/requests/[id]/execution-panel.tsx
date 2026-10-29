import { getDb } from "@/lib/db/server";
import type { Enums } from "@/lib/db/types";
import { getRequestDocuments } from "@/lib/execution/queries";
import { formatDateTime, timeLeft } from "@/lib/format";
import { DELEGATION_LABEL } from "@/lib/providers/constants";
import { startExecution } from "@/app/actions/execution";
import { ActionButton } from "@/components/action-button";
import { RequestDocumentsList } from "@/components/request-documents";
import { UploadRequestDocument } from "@/components/upload-request-document";
import { Badge, Card } from "@/components/ui";
import { DeliveryForm } from "./delivery-form";

/** مراحل التنفيذ للمزوّد المُرسى عليه (البيانات محمية بـ RLS) */
export async function ProviderExecutionPanel({ requestId }: { requestId: string }) {
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
  }>(
    `select r.status, r.delegation_confirmed_at, r.started_at, r.due_at, r.delivered_at,
            r.delivery_note, r.is_late, t.delegation_platform
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
  const documents = await getRequestDocuments(requestId);
  const clientDocs = documents.filter((d) => d.kind === "client_document");
  const proofs = documents.filter((d) => d.kind === "delivery_proof");
  const platform = request.delegation_platform ?? "none";
  const delegationReady = platform === "none" || Boolean(request.delegation_confirmed_at);

  return (
    <div className="space-y-6">
      <Card className="space-y-3" data-testid="provider-execution">
        <h2 className="font-semibold">التنفيذ</h2>
        <p className="text-sm">
          التفويض ({platform === "none" ? "لا يتطلب منصة" : DELEGATION_LABEL[platform]}):{" "}
          {request.delegation_confirmed_at ? (
            <Badge tone="success">أكّد العميل منح التفويض</Badge>
          ) : (
            <Badge tone="warning">بانتظار العميل</Badge>
          )}
        </p>
        <div>
          <p className="mb-1 text-sm font-medium">مستندات العميل</p>
          <RequestDocumentsList
            documents={clientDocs}
            emptyText="لم يرفع العميل مستندات بعد."
            testId="provider-client-documents"
          />
        </div>

        {request.status === "awaiting_client" && (
          <div className="space-y-2 border-t border-border pt-3">
            {!delegationReady && (
              <p className="text-sm text-muted">
                تبدأ التنفيذ بعد أن يؤكد العميل منح التفويض عبر المنصة الرسمية. لا تطلب منه أبداً
                كلمة مرور أو رمز تحقق.
              </p>
            )}
            <ActionButton
              action={startExecution}
              fields={{ requestId }}
              className={`rounded-lg px-4 py-2 font-medium text-white ${delegationReady ? "bg-primary hover:bg-primary-hover" : "cursor-not-allowed bg-muted"}`}
            >
              بدء التنفيذ
            </ActionButton>
          </div>
        )}

        {request.started_at && (
          <p className="text-sm">
            بدأ في {formatDateTime(request.started_at)}
            {request.due_at && ` · الموعد: ${formatDateTime(request.due_at)}`}
            {request.status === "in_progress" && !request.is_late && timeLeft(request.due_at) && (
              <span className="text-muted"> (المتبقي {timeLeft(request.due_at)})</span>
            )}
            {request.is_late && (
              <Badge tone="danger" className="ms-2" data-testid="late-badge">
                متأخر
              </Badge>
            )}
          </p>
        )}

        {request.status === "in_progress" && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm font-medium">إثبات الإنجاز</p>
            <RequestDocumentsList documents={proofs} emptyText="لم ترفع إثباتاً بعد." />
            <UploadRequestDocument requestId={requestId} labels={[]} testId="upload-proof" />
            <DeliveryForm requestId={requestId} hasProof={proofs.length > 0} />
          </div>
        )}

        {request.delivered_at && (
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <p>
              سُلّم في {formatDateTime(request.delivered_at)}: {request.delivery_note}
            </p>
            <RequestDocumentsList documents={proofs} emptyText="—" />
            {request.status === "delivered" && (
              <p className="text-muted">بانتظار تأكيد العميل (يكتمل تلقائياً بعد 3 أيام بلا رد).</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
