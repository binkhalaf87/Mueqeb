import { Badge } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, type RequestStatus } from "@/lib/requests/constants";

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} data-testid="request-status">
      {STATUS_LABEL[status]}
    </Badge>
  );
}
