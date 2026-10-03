import { Badge } from "@wiwaha/ui";
import type { StageStatus } from "@wiwaha/db";

const MAP: Record<StageStatus, { label: string; tone: "sage" | "gold" | "burgundy" | "neutral" | "solid" }> = {
  locked: { label: "Locked", tone: "neutral" },
  not_started: { label: "Not started", tone: "gold" },
  in_progress: { label: "In progress", tone: "sage" },
  awaiting_client: { label: "Awaiting your approval", tone: "burgundy" },
  done: { label: "Done", tone: "solid" },
  snoozed: { label: "Snoozed", tone: "neutral" },
};

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const UNLOCK_TEXT: Record<string, string> = {
  none: "Open any time",
  deposit_paid: "Unlocks after the 10% deposit",
  brief_started: "Unlocks once your brief is started",
  contract_paid: "Unlocks after the 40% contract payment",
  quote_approved: "Unlocks once your quote is approved",
  event_complete: "Unlocks after the wedding",
};
