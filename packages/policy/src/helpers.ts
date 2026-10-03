import type { PolicyBook } from "./book";

/** True when the caller's city is outside the local area defined in 'pricing.phone'. */
export function isOutOfTown(book: PolicyBook, city: string | null | undefined): boolean | null {
  if (!city || !city.trim()) return null; // unknown: the agent should ask
  const local = book.get("pricing.phone").local_cities.map((c) => c.toLowerCase());
  const normalised = city.trim().toLowerCase();
  return !local.some((c) => normalised.includes(c));
}

/**
 * The "starting from" band an out-of-town caller may receive, or null when the
 * policy doesn't allow it (or Prashanth hasn't approved a figure yet).
 */
export function startingFromBand(book: PolicyBook): { paise: number; label: string } | null {
  const band = book.get("pricing.phone").out_of_town_band;
  if (!band.enabled || band.starting_from_paise === null) return null;
  return { paise: band.starting_from_paise, label: band.label };
}

export function softHoldHours(book: PolicyBook): number {
  return book.get("holds.soft_hold").hours;
}

/** Splits a total into milestone amounts following 'payments.schedule' (last milestone takes the remainder). */
export function splitPayments(book: PolicyBook, totalPaise: number): { milestone: string; label: string; amountPaise: number }[] {
  const ms = book.get("payments.schedule").milestones;
  let allocated = 0;
  return ms.map((m, i) => {
    const amount = i === ms.length - 1 ? totalPaise - allocated : Math.floor((totalPaise * m.percent_bps) / 10000 / 100) * 100;
    allocated += amount;
    return { milestone: m.milestone, label: m.label, amountPaise: amount };
  });
}

/**
 * What must happen before décor work may begin, from 'decor.providers' and
 * 'payments.schedule' (e.g. "the 40% contract payment"). Null when décor has
 * no unlock condition.
 */
export function decorUnlockLabel(book: PolicyBook): string | null {
  const unlock = book.get("decor.providers").requires_payment_unlock;
  const milestone = unlock === "deposit_paid" ? "deposit" : unlock === "contract_paid" ? "contract" : null;
  if (milestone) {
    const m = book.get("payments.schedule").milestones.find((x) => x.milestone === milestone);
    if (m) return `the ${m.percent_bps / 100}% ${milestone} payment`;
  }
  switch (unlock) {
    case "none": return null;
    case "brief_started": return "your wedding brief is started";
    case "quote_approved": return "your quote is approved";
    case "event_complete": return "the event is complete";
    default: return `the ${milestone ?? unlock.replace(/_/g, " ")} step`;
  }
}
