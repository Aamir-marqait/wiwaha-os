import { addDays } from "@wiwaha/db";

/** What paying a part unlocks (payments.effect). */
export const EFFECTS = ["books", "holds_date", "signs_contract", "final", "none"] as const;
export type Effect = (typeof EFFECTS)[number];
export const EFFECT_LABELS: Record<Effect, string> = {
  books: "Advance: holds the date and signs the contract",
  holds_date: "Holds the date only",
  signs_contract: "Signs the contract and opens planning",
  final: "Final payment",
  none: "Nothing extra",
};
export const DUE_KINDS = ["on_booking", "days_after_booking", "days_before_event"] as const;
export type DueKind = (typeof DUE_KINDS)[number];

/** A part in Prashanth's standard split (policy) or before a wedding has dates. */
export interface RelativePart { milestone?: string; label: string; percent: number; due: DueKind; days: number; effect: Effect }
/** A part on a booked wedding. */
export interface DatedPart { id?: string; label: string; percent: number; dueOn: string; effect: Effect; paid?: boolean }

export function isEffect(v: unknown): v is Effect {
  return typeof v === "string" && (EFFECTS as readonly string[]).includes(v);
}

export function dueText(p: Pick<RelativePart, "due" | "days">): string {
  if (p.due === "on_booking") return "on booking";
  if (p.due === "days_after_booking") return `within ${p.days} days of booking`;
  return `${p.days} days before the event`;
}

/** The plain-English rule agents read, e.g. "10% on booking holds the date; ...". */
export function scheduleRuleText(parts: RelativePart[]): string {
  const effect: Record<Effect, string> = { books: " holds the date and signs the contract", holds_date: " holds the date", signs_contract: " signs the contract", final: "", none: "" };
  return parts.map((p) => `${p.percent}% ${p.due === "on_booking" ? "on booking" : `due ${dueText(p)}`}${effect[p.effect]}`).join("; ") + ".";
}

/** Turns a standard split into dates for one wedding. */
export function datesFor(parts: RelativePart[], bookedOn: string, eventStart: string): DatedPart[] {
  return parts.map((p) => ({
    label: p.label,
    percent: p.percent,
    effect: p.effect,
    dueOn: p.due === "on_booking" ? bookedOn : p.due === "days_after_booking" ? addDays(bookedOn, p.days) : addDays(eventStart, -p.days),
  }));
}

/** Sum of percentages, rounded to two places. */
export function totalPercent(parts: { percent: number }[]): number {
  return Math.round(parts.reduce((s, p) => s + (Number.isFinite(p.percent) ? p.percent : 0), 0) * 100) / 100;
}

/** Policy JSON milestones → editable parts. */
export function fromPolicy(milestones: { milestone: string; label: string; percent_bps: number; due: string; days?: number; effect: string }[]): RelativePart[] {
  return milestones.map((m) => ({
    milestone: m.milestone,
    label: m.label,
    percent: m.percent_bps / 100,
    due: (DUE_KINDS as readonly string[]).includes(m.due) ? (m.due as DueKind) : "on_booking",
    days: m.days ?? 0,
    effect: isEffect(m.effect) ? m.effect : "none",
  }));
}

/** Parts → database rows for set_payment_parts. */
export function toRpcParts(parts: DatedPart[]) {
  return parts.map((p) => ({ id: p.id ?? null, label: p.label.trim(), percent_bps: Math.round(p.percent * 100), due_on: p.dueOn, effect: p.effect }));
}

/** Parses the booking form's "parts" field (only present when Prashanth changed the split). */
export function parseRelativeParts(raw: string | null | undefined): RelativePart[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const parts = v.flatMap((x: unknown): RelativePart[] => {
      if (!x || typeof x !== "object") return [];
      const o = x as Record<string, unknown>;
      const due = typeof o.due === "string" && (DUE_KINDS as readonly string[]).includes(o.due) ? (o.due as DueKind) : null;
      if (typeof o.label !== "string" || typeof o.percent !== "number" || !due || !isEffect(o.effect)) return [];
      return [{ label: o.label, percent: o.percent, due, days: typeof o.days === "number" ? o.days : 0, effect: o.effect }];
    });
    return parts.length === v.length && parts.length > 0 ? parts : null;
  } catch {
    return null;
  }
}
