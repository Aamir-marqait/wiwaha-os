import type { LeadStatus } from "@wiwaha/db";

/**
 * The sales pipeline as the team talks about it (D44): seven stages. The
 * database keeps two finer states ("followed up" is shown as Visited, "no
 * response" as Lost, with its reason).
 */
export const STAGES = [
  { key: "new", label: "New", statuses: ["new"] },
  { key: "contacted", label: "Contacted", statuses: ["contacted"] },
  { key: "visit_booked", label: "Visit booked", statuses: ["visit_booked"] },
  { key: "visited", label: "Visited", statuses: ["visited", "follow_up_done"] },
  { key: "negotiating", label: "Negotiating", statuses: ["negotiating"] },
  { key: "won", label: "Booked", statuses: ["won"] },
  { key: "lost", label: "Lost", statuses: ["lost", "no_response"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly LeadStatus[] }[];

export type StageKey = (typeof STAGES)[number]["key"];
export const OPEN_STAGES: StageKey[] = ["new", "contacted", "visit_booked", "visited", "negotiating"];

export function stageOf(status: string): (typeof STAGES)[number] {
  return STAGES.find((s) => (s.statuses as readonly string[]).includes(status)) ?? STAGES[0];
}
