import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, NON_NEGOTIABLE_KEYS, PolicyBook, PolicyError, POLICY_KEYS, isOutOfTown, splitPayments, startingFromBand } from "./index";

const HANDOFF_RULES: Record<string, string> = {
  "honesty.commitments": "Agents never make a commitment that isn't in the policy book. Unknown → escalate to a human.",
  "pricing.phone": "No prices quoted on the phone; invite the caller to visit. Out-of-town callers may get the approved \"starting from\" band plus the brochure and video tour on WhatsApp.",
  "followup.after_visit": "Exactly one follow-up call, two days after a site visit. No response = stop calling.",
  "payments.schedule": "10% deposit holds the date; 40% within two weeks signs the contract; 50% due 30 days before the event.",
  "contract.template": "Plain black-and-white template; e-signature.",
  "decor.providers": "Only the in-house team or a designated planner. Venue provides infrastructure (power, complimentary rooms).",
  moodboards: "About five per function, broad themes first, then detail. Standard and custom labelled clearly.",
  "planning.start": "Recommended ~90 days before; the couple can start any stage earlier, but never before its payment unlock.",
  "audit.portal_edits": "Every portal edit logs user, time and IP address.",
  "reviews.after_event": "Personalised review form by email after each event; low scores reach Prashanth within 2 hours.",
  farewell: "Thank-you note, parting gift (chocolates or an Amazon voucher), added to the newsletter.",
};

describe("policy defaults", () => {
  it("has a default for every typed key and every default validates", () => {
    const book = PolicyBook.defaults();
    expect(book.issues).toEqual([]);
    for (const k of POLICY_KEYS) expect(book.has(k)).toBe(true);
    expect(DEFAULT_POLICIES.length).toBe(POLICY_KEYS.length);
  });

  it("keeps Prashanth's non-negotiable wording exactly", () => {
    const book = PolicyBook.defaults();
    for (const k of NON_NEGOTIABLE_KEYS) expect(book.ruleText(k)).toBe(HANDOFF_RULES[k]);
  });

  it("encodes 10/40/50 with the right due rules", () => {
    const ms = PolicyBook.defaults().get("payments.schedule").milestones;
    expect(ms.map((m) => m.percent_bps)).toEqual([1000, 4000, 5000]);
    expect(ms[1]).toMatchObject({ due: "days_after_booking", days: 14 });
    expect(ms[2]).toMatchObject({ due: "days_before_event", days: 30 });
  });

  it("allows exactly one follow-up call two days after a visit", () => {
    expect(PolicyBook.defaults().get("followup.after_visit")).toEqual({ calls: 1, days_after_visit: 2, stop_if_no_response: true });
  });

  it("does not let agents quote prices on the phone or offer discounts", () => {
    const book = PolicyBook.defaults();
    expect(book.get("pricing.phone").quote_prices_on_phone).toBe(false);
    expect(book.get("discounts").agents_may_offer).toBe(false);
  });

  it("locks décor behind the 40% contract payment", () => {
    const book = PolicyBook.defaults();
    const decor = book.get("portal.stage_cards").cards.find((c) => c.key === "decor");
    expect(decor?.unlock).toBe("contract_paid");
    expect(book.get("decor.providers").requires_payment_unlock).toBe("contract_paid");
  });
});

describe("PolicyBook", () => {
  it("drops invalid rows and reports them", () => {
    const book = PolicyBook.fromRows([
      { key: "followup.after_visit", topic: "x", title: "x", rule_text: "x", value: { calls: 3 }, version: 2, client_visible: false, needs_confirmation: false, sort: 1 },
    ]);
    expect(book.has("followup.after_visit")).toBe(false);
    expect(book.issues[0]?.key).toBe("followup.after_visit");
    expect(() => book.get("followup.after_visit")).toThrow(PolicyError);
  });

  it("reflects an edited rule immediately", () => {
    const rows = DEFAULT_POLICIES.map((p) => ({ ...p, value: p.value as unknown, version: 1 }));
    const edited = rows.map((r) => (r.key === "holds.soft_hold" ? { ...r, value: { hours: 48, auto_release: true, notify_client_on_release: true }, rule_text: "Hold for 48 hours.", version: 2 } : r));
    const book = PolicyBook.fromRows(edited);
    expect(book.get("holds.soft_hold").hours).toBe(48);
    expect(book.digest(["holds.soft_hold"])).toContain("v2] Soft holds: Hold for 48 hours.");
  });
});

describe("helpers", () => {
  const book = PolicyBook.defaults();
  it("detects out-of-town callers", () => {
    expect(isOutOfTown(book, "Bengaluru")).toBe(false);
    expect(isOutOfTown(book, "Mumbai")).toBe(true);
    expect(isOutOfTown(book, "")).toBeNull();
  });
  it("withholds the starting-from band until a figure is approved", () => {
    expect(startingFromBand(book)).toBeNull();
  });
  it("splits payments to the rupee with the remainder on the last milestone", () => {
    const parts = splitPayments(book, 3_456_789_01);
    expect(parts.reduce((s, p) => s + p.amountPaise, 0)).toBe(3_456_789_01);
    expect(parts[0]!.amountPaise % 100).toBe(0);
  });
});
