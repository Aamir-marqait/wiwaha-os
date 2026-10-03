import type { PolicyBook } from "@wiwaha/policy";

/**
 * Deterministic last line of defence on every client-facing draft, whatever
 * the model wrote. Hard flags mean the draft must not go out as written; soft
 * flags force human approval regardless of the agent's autonomy dial.
 */
export type GuardrailFlag =
  | "price_quote" // a rupee amount / per-plate price (only the approved band is allowed)
  | "discount_promise" // offering or promising a discount
  | "date_commitment" // telling the client a date is confirmed/held when it isn't
  | "decor_policy" // inviting outside décor
  | "unlock_bypass" // offering décor/moodboard work before its payment unlock
  | "guarantee" // promising outcomes
  | "mentions_discount"; // talks about discounts at all (soft)

export const HARD_FLAGS: readonly GuardrailFlag[] = ["price_quote", "discount_promise", "date_commitment", "decor_policy", "unlock_bypass"];

export interface GuardrailContext {
  book: PolicyBook;
  /** Amounts (paise) this message may state, e.g. the approved out-of-town band. */
  allowedAmountsPaise?: number[];
  /** True when the lead really has an active hold or confirmed booking. */
  hasActiveHold?: boolean;
  /** True when this wedding has met décor's payment unlock ('decor.providers'). */
  decorUnlocked?: boolean;
}

export interface GuardrailResult {
  ok: boolean; // no hard flags
  flags: GuardrailFlag[];
  reasons: string[];
}

const MONEY = [
  /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?(?:\s*(?:k|l|lakh|lakhs|lac|lacs|cr|crore|crores))?/gi,
  /\b[\d,]+(?:\.\d+)?\s*(?:lakh|lakhs|lac|lacs|crore|crores)\b/gi,
  /\b[\d,]+(?:\.\d+)?\s*(?:\/-|rupees)/gi,
  /\b[\d,]+\s*(?:per|\/)\s*(?:plate|head|pax|person|night|day)\b/gi,
];

const DISCOUNT_PROMISE = [
  /\b(?:we|i)(?:'ll| will| can| could|'d| would| are able to| am able to| are happy to| am happy to)\s+(?:be able to\s+)?(?:offer|give|provide|extend|arrange|do)\s+(?:you\s+)?(?:a|an|some|the)?\s*(?:\d+\s*%|special|discount|reduced|lower|better)/i,
  /\b\d+\s*%\s*(?:off|discount)\b/i,
  /\b(?:special|discounted|reduced|introductory|festive)\s+(?:price|rate|pricing|package|offer)\b/i,
  /\bwaive(?:d)?\b.*\b(?:fee|charge|deposit|payment)\b/i,
];

const DATE_COMMITMENT = [
  /\byour (?:date|day|wedding date)\s+(?:is|has been)\s+(?:now\s+)?(?:confirmed|booked|reserved|secured|blocked|held|locked)\b/i,
  /\bwe(?:'ve| have)\s+(?:reserved|blocked|booked|held|locked|secured)\s+(?:the|your)\b/i,
  /\b(?:date|venue) is (?:yours|guaranteed)\b/i,
];

const OUTSIDE_DECOR = [
  /\b(?:you can|you may|feel free to|welcome to)\s+(?:bring|use|hire)\s+(?:your|an?)\s+(?:own|outside|external|preferred)\s+(?:decorator|décor|decor|florist)/i,
];

const DECOR_BEFORE_UNLOCK = [
  /\b(?:we|i)(?:'ll| will| can| could|'d| would| are happy to| am happy to| shall)\s+(?:go ahead and\s+|happily\s+)?(?:start|begin|send|share|prepare|create|design|make|put together|work on)\s+(?:on\s+)?(?:your|the|some|a few|a|five)?\s*(?:\w+\s+)?(?:d[eé]cor|mood ?boards?)/i,
  /\bmood ?boards?\b[^.]*\b(?:right away|today|tomorrow|this week|before (?:you|the) (?:book|pay)\w*|straight away|immediately)\b/i,
];

const GUARANTEE = [/\bguarantee(?:d|s)?\b/i, /\b100\s*%\s*(?:sure|guaranteed|certain)\b/i, /\bwe promise\b/i];

function toPaise(raw: string): number | null {
  const s = raw.toLowerCase().replace(/,/g, "");
  const num = Number((s.match(/[\d.]+/) ?? [""])[0]);
  if (!Number.isFinite(num) || num === 0) return null;
  let rupees = num;
  if (/\b(?:lakh|lakhs|lac|lacs)\b|\d\s*l\b/.test(s)) rupees = num * 100_000;
  else if (/\b(?:cr|crore|crores)\b/.test(s)) rupees = num * 10_000_000;
  else if (/\d\s*k\b/.test(s)) rupees = num * 1000;
  return Math.round(rupees * 100);
}

export function checkClientMessage(text: string, ctx: GuardrailContext): GuardrailResult {
  const flags = new Set<GuardrailFlag>();
  const reasons: string[] = [];

  const allowed = new Set(ctx.allowedAmountsPaise ?? []);
  const pricesOk = ctx.book.get("pricing.phone").quote_prices_on_phone;
  for (const re of MONEY) {
    for (const m of text.matchAll(re)) {
      const paise = toPaise(m[0]);
      if (pricesOk) continue;
      if (paise !== null && allowed.has(paise)) continue;
      flags.add("price_quote");
      reasons.push(`States a price ("${m[0].trim()}"), which the policy book doesn't allow here`);
    }
  }

  if (!ctx.book.get("discounts").agents_may_offer) {
    for (const re of DISCOUNT_PROMISE) {
      const m = text.match(re);
      if (m) {
        flags.add("discount_promise");
        reasons.push(`Offers a discount ("${m[0].trim()}"); only Prashanth can decide discounts`);
      }
    }
    if (/\bdiscount/i.test(text)) flags.add("mentions_discount");
  }

  if (!ctx.hasActiveHold) {
    for (const re of DATE_COMMITMENT) {
      const m = text.match(re);
      if (m) {
        flags.add("date_commitment");
        reasons.push(`Commits to a date ("${m[0].trim()}") that isn't held on the calendar`);
      }
    }
  }

  const decor = ctx.book.get("decor.providers");
  if (decor.allowed.length > 0) {
    for (const re of OUTSIDE_DECOR) {
      const m = text.match(re);
      if (m) {
        flags.add("decor_policy");
        reasons.push(`Invites outside décor ("${m[0].trim()}"); décor is in-house or a designated planner only`);
      }
    }
  }

  if (decor.requires_payment_unlock !== "none" && !ctx.decorUnlocked) {
    for (const re of DECOR_BEFORE_UNLOCK) {
      const m = text.match(re);
      if (m) {
        flags.add("unlock_bypass");
        reasons.push(`Offers décor work ("${m[0].trim()}") before its payment unlock in the policy book`);
      }
    }
  }

  for (const re of GUARANTEE) {
    const m = text.match(re);
    if (m) {
      flags.add("guarantee");
      reasons.push(`Promises an outcome ("${m[0].trim()}")`);
    }
  }

  const list = [...flags];
  return { ok: !list.some((f) => HARD_FLAGS.includes(f)), flags: list, reasons: [...new Set(reasons)] };
}
