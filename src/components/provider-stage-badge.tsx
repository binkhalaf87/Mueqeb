import { Badge } from "@/components/ui";
import { STAGE_LABEL, type ProviderStage } from "@/lib/providers/constants";

const TONE = {
  draft: "neutral",
  under_review: "info",
  approved: "success",
  rejected: "danger",
  suspended: "warning",
} as const;

export function ProviderStageBadge({ stage }: { stage: ProviderStage }) {
  return (
    <Badge tone={TONE[stage]} data-testid="provider-stage">
      {STAGE_LABEL[stage]}
    </Badge>
  );
}
