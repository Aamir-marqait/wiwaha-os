import type { Lead } from "@wiwaha/db";
import { daysBetween } from "@wiwaha/db";
import type { PolicyBook } from "@wiwaha/policy";

export interface ScoreInput {
  lead: Pick<Lead, "date_wanted" | "date_flexible" | "guest_count" | "budget_paise" | "budget_text" | "source">;
  /** Number of spaces free on the wanted date that can seat the guests (null = no date). */
  freeSpaces: number | null;
  today: string;
}

export interface ScoreBreakdown {
  date_fit: number;
  guest_fit: number;
  budget: number;
  source: number;
  notes: string[];
}

export interface ScoreResult {
  score: number;
  hot: boolean;
  breakdown: ScoreBreakdown;
}

/**
 * Rules-based lead score (0–100). Weights, bands and source scores come from
 * policy 'lead_scoring', so Prashanth can tune them without code. See D8.
 */
export function scoreLead(book: PolicyBook, input: ScoreInput): ScoreResult {
  const p = book.get("lead_scoring");
  const notes: string[] = [];
  const { lead } = input;

  // Date fit: is the date free, and is it a sensible distance away?
  let date: number;
  if (!lead.date_wanted) {
    date = lead.date_flexible ? 0.5 : 0.4;
    notes.push("No date yet");
  } else {
    const days = daysBetween(input.today, lead.date_wanted);
    if (days < 0) {
      date = 0;
      notes.push("Date is in the past");
    } else if (input.freeSpaces === 0) {
      date = lead.date_flexible ? 0.35 : 0.1;
      notes.push("Wanted date is already taken");
    } else {
      date = days < 21 ? 0.6 : 1;
      notes.push(days < 21 ? "Date is free but very soon" : "Date is free");
    }
  }

  // Guest fit against the ideal band and the estate's maximum.
  let guests: number;
  const g = lead.guest_count;
  if (g === null || g === undefined) {
    guests = 0.5;
    notes.push("Guest count unknown");
  } else if (g > p.max_guests) {
    guests = 0.1;
    notes.push(`More guests than the estate can host (${g})`);
  } else if (g >= p.ideal_guests.min && g <= p.ideal_guests.max) {
    guests = 1;
  } else if (g > p.ideal_guests.max) {
    guests = 0.75;
  } else {
    guests = Math.max(0.3, g / p.ideal_guests.min);
  }

  // Budget signal.
  let budget: number;
  const b = lead.budget_paise;
  if (b === null || b === undefined) {
    budget = lead.budget_text ? 0.5 : 0.4;
    if (!lead.budget_text) notes.push("No budget signal");
  } else if (b >= p.budget_bands_paise.premium) budget = 1;
  else if (b >= p.budget_bands_paise.good) budget = 0.85;
  else if (b >= p.budget_bands_paise.low) budget = 0.5;
  else {
    budget = 0.2;
    notes.push("Budget below our usual range");
  }

  const source = p.source_scores[lead.source] ?? p.source_scores.other ?? 0.4;
  if (lead.source === "wedmegood") notes.push("WedMeGood lead (weighted highest)");

  const w = p.weights;
  const total = w.date_fit + w.guest_fit + w.budget + w.source;
  const score = Math.round(((w.date_fit * date + w.guest_fit * guests + w.budget * budget + w.source * source) / total) * 100);

  return {
    score,
    hot: score >= p.hot_threshold,
    breakdown: {
      date_fit: round2(date),
      guest_fit: round2(guests),
      budget: round2(budget),
      source: round2(source),
      notes,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Intent = "price" | "discount" | "availability" | "visit" | "rooms" | "outside_caterer" | "outside_decor" | "decor_early";

const INTENT_PATTERNS: Record<Intent, RegExp> = {
  price: /\b(price|pricing|cost|costs|rate|rates|charges?|quote|quotation|how much|package|budget|tariff)\b/i,
  discount: /\b(discount|cheap(er)?|lower (the )?price|negotiat\w*|best (price|rate|deal)|deal|offer|concession)\b/i,
  availability: /\b(availab\w*|free on|open on|is .* free|dates?)\b/i,
  visit: /\b(visit|see the (venue|place|estate)|tour|walk ?through|come (and|to) see|site visit)\b/i,
  rooms: /\b(rooms?|stay|accommodat\w*|overnight)\b/i,
  outside_caterer: /\b(outside|own|external|our)\s+cater\w*|\bbring\b.*\bcater\w*/i,
  outside_decor: /\b(outside|own|external|our)\s+(decor\w*|décor\w*|decorator)|\bbring\b.*\b(decor\w*|décor\w*)/i,
  decor_early: /\bmood ?boards?\b|\b(start|begin|plan|design|see)\w*\s+(on\s+|the\s+|our\s+)?(decor|décor)\b|\b(decor|décor)\s+(designs?|plans?|planning|ideas?|concepts?|mock-?ups?)\b/i,
};

export function detectIntents(text: string | null | undefined): Intent[] {
  if (!text) return [];
  return (Object.keys(INTENT_PATTERNS) as Intent[]).filter((k) => INTENT_PATTERNS[k].test(text));
}
