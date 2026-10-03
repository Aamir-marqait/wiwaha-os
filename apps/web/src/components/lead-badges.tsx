import { Badge } from "@wiwaha/ui";
import type { LeadStatus } from "@wiwaha/db";

const STATUS: Record<LeadStatus, { label: string; tone: "sage" | "gold" | "burgundy" | "neutral" | "solid" }> = {
  new: { label: "New", tone: "gold" },
  contacted: { label: "Contacted", tone: "neutral" },
  visit_booked: { label: "Visit booked", tone: "sage" },
  visited: { label: "Visited", tone: "sage" },
  follow_up_done: { label: "Followed up", tone: "neutral" },
  negotiating: { label: "Negotiating", tone: "gold" },
  won: { label: "Booked", tone: "solid" },
  lost: { label: "Lost", tone: "burgundy" },
  no_response: { label: "No response", tone: "neutral" },
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ScoreBadge({ score, hot }: { score: number | null; hot?: boolean }) {
  if (score === null) return <Badge>Unscored</Badge>;
  const tone = hot ? "burgundy" : score >= 60 ? "sage" : "neutral";
  return <Badge tone={tone}>{hot ? "🔥 " : ""}{score}</Badge>;
}

export const SOURCE_LABELS: Record<string, string> = {
  website: "Website", manual: "Manual", phone: "Phone", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook",
  meta_form: "Meta form", google_form: "Google form", google_ads: "Google Ads", wedmegood: "WedMeGood", referral: "Referral", walk_in: "Walk-in", other: "Other",
};
