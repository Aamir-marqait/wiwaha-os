import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeadWithContact } from "@wiwaha/db";
import { PolicyBook } from "@wiwaha/policy";
import { beforeEach, describe, expect, it } from "vitest";
import { checkClientMessage } from "../../framework/guardrails";
import { NoLlm, ScriptedLlm } from "../../framework/llm";
import { MemoryAgentStore } from "../../framework/memory-store";
import type { AgentDeps } from "../../framework/types";
import { PROMPTS } from "../../prompts.generated";
import { processLead, templateReply } from "./agent";
import { detectIntents, scoreLead } from "./scoring";

const NOW = new Date("2026-10-03T04:00:00Z"); // 9:30 am IST

function lead(overrides: Partial<LeadWithContact> = {}): LeadWithContact {
  return {
    id: "lead-1", contact_id: "c-1", source: "website", source_detail: null, event_type: "wedding",
    date_wanted: "2027-03-14", date_flexible: false, alt_dates: [], guest_count: 220, budget_paise: null, budget_text: null,
    rooms_needed: null, city: "Bengaluru", message: "Is the venue available?", score: null, score_breakdown: null, hot: false,
    status: "new", assigned_to: null, hold_expires_at: null, wedding_id: null, touch_count: 1,
    first_touch_at: NOW.toISOString(), last_touch_at: NOW.toISOString(), created_at: NOW.toISOString(),
    contact: { id: "c-1", full_name: "Meera Iyer", phone_e164: "+919900011101", email: "meera@example.com", city: "Bengaluru" },
    ...overrides,
  };
}

function setup(l: LeadWithContact, llm = new NoLlm() as AgentDeps["llm"]) {
  const store = new MemoryAgentStore();
  store.leads = [l];
  store.spaces = [
    { id: "s1", name: "The Grand Lawn", capacity: 1000, takenDates: [] },
    { id: "s2", name: "The Pavilion", capacity: 600, takenDates: [] },
  ];
  const deps: AgentDeps = { store, llm, now: () => NOW };
  return { store, deps };
}

describe("Lead Desk: scoring", () => {
  const book = PolicyBook.defaults();
  it("weights WedMeGood highest", () => {
    const base = { date_wanted: "2027-03-14", date_flexible: false, guest_count: 220, budget_paise: null, budget_text: null };
    const wmg = scoreLead(book, { lead: { ...base, source: "wedmegood" }, freeSpaces: 2, today: "2026-10-03" });
    const insta = scoreLead(book, { lead: { ...base, source: "instagram" }, freeSpaces: 2, today: "2026-10-03" });
    expect(wmg.score).toBeGreaterThan(insta.score);
  });
  it("marks an ideal WedMeGood lead as hot and a taken date as cold", () => {
    const hot = scoreLead(book, { lead: { date_wanted: "2027-03-14", date_flexible: false, guest_count: 250, budget_paise: 40_00_000_00, budget_text: null, source: "wedmegood" }, freeSpaces: 2, today: "2026-10-03" });
    expect(hot.hot).toBe(true);
    const taken = scoreLead(book, { lead: { date_wanted: "2027-03-14", date_flexible: false, guest_count: 250, budget_paise: null, budget_text: null, source: "instagram" }, freeSpaces: 0, today: "2026-10-03" });
    expect(taken.hot).toBe(false);
    expect(taken.breakdown.notes).toContain("Wanted date is already taken");
  });
  it("uses weights from the policy book (owner can retune)", () => {
    const rows = book.all().map((r) => ({ ...r, value: r.value as unknown }));
    const tuned = PolicyBook.fromRows(rows.map((r) => (r.key === "lead_scoring" ? { ...r, value: { ...(r.value as object), hot_threshold: 10 } } : r)));
    const s = scoreLead(tuned, { lead: { date_wanted: null, date_flexible: false, guest_count: null, budget_paise: null, budget_text: null, source: "other" }, freeSpaces: null, today: "2026-10-03" });
    expect(s.hot).toBe(true);
  });
  it("detects what the family is asking", () => {
    expect(detectIntents("What's the price for 600 people? Can you give a discount?")).toEqual(expect.arrayContaining(["price", "discount"]));
    expect(detectIntents("Do you allow outside caterers?")).toContain("outside_caterer");
    expect(detectIntents("Can we bring our own decorator?")).toContain("outside_decor");
  });
});

describe("Lead Desk: drafting and the gate", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup(lead());
  });

  it("scores, drafts a reply and puts it in the approval queue (draft mode)", async () => {
    const out = await processLead(ctx.deps, "lead-1");
    expect(out.status).toBe("done");
    if (out.status !== "done") return;
    expect(out.result.approvalId).not.toBeNull();
    expect(ctx.store.approvals[0]).toMatchObject({ kind: "lead_reply", agentKey: "lead_desk", leadId: "lead-1" });
    expect(ctx.store.messages[0]).toMatchObject({ status: "pending_approval", channel: "whatsapp" });
    expect(ctx.store.leads[0]!.score).toBe(out.result.score.score);
    // every step is logged
    expect(ctx.store.actions.map((a) => a.action)).toEqual(["score_lead", "draft_reply"]);
    expect(ctx.store.actions[1]).toMatchObject({ status: "gated", approvalId: out.result.approvalId });
    expect(ctx.store.actions[1]!.policyKeys).toContain("pricing.phone");
  });

  it("says a free date is 'currently open', never 'confirmed'", async () => {
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.reply!.body).toMatch(/currently open/);
    expect(out.result.reply!.body).not.toMatch(/confirmed|reserved|booked/i);
  });

  it("caller demanding a price: no price in the reply, invited to visit", async () => {
    ctx = setup(lead({ message: "Just tell me the price. How much for 300 guests? I need a number now." }));
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    const body = out.result.reply!.body;
    expect(body).not.toMatch(/₹|rs\.?\s*\d|lakh|\d+\s*per plate/i);
    expect(body).toMatch(/visit/i);
    expect(checkClientMessage(body, { book: PolicyBook.defaults() }).ok).toBe(true);
  });

  it("discount request: never promised, escalated to Prashanth", async () => {
    ctx = setup(lead({ message: "Can you give us a discount? We want the best price, 20% off would be great." }));
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.reply!.flags).not.toContain("discount_promise");
    expect(out.result.reply!.body).not.toMatch(/\d+\s*%|special (price|rate)/i);
    expect(ctx.store.humanQueue).toContainEqual(expect.objectContaining({ reason: "escalation", assignedRole: "owner", leadId: "lead-1" }));
    expect(out.result.escalations).toContain("discount");
  });

  it("out-of-town price ask with no approved band: no price, escalated", async () => {
    ctx = setup(lead({ city: "Mumbai", contact: { id: "c", full_name: "Rhea Kapoor", phone_e164: "+919900011104", email: null, city: "Mumbai" }, message: "We're in Mumbai. What does it cost roughly?" }));
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.reply!.body).not.toMatch(/₹/);
    expect(out.result.reply!.body).toMatch(/video/i);
    expect(out.result.escalations).toContain("starting_from_band_missing");
  });

  it("out-of-town price ask with an approved band: shares exactly that band", async () => {
    ctx = setup(lead({ city: "Mumbai", contact: { id: "c", full_name: "Rhea Kapoor", phone_e164: "+919900011104", email: null, city: "Mumbai" }, message: "We're in Mumbai. What does it cost roughly?" }));
    const pricing = ctx.store.policies.find((p) => p.key === "pricing.phone")!;
    ctx.store.setPolicy("pricing.phone", { ...(pricing.value as object), out_of_town_band: { enabled: true, starting_from_paise: 25_00_000_00, label: "Starting from ₹25 L" } });
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.reply!.body).toContain("₹25,00,000");
    expect(out.result.reply!.flags).not.toContain("price_quote");
    expect(out.result.escalations).not.toContain("starting_from_band_missing");
  });

  it("outside décor request: answers from the décor rule, never invites outside decorators", async () => {
    ctx = setup(lead({ message: "Can we bring our own decorator for the mandap?" }));
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.reply!.body).toMatch(/in-house team or a designated planner/);
    expect(out.result.reply!.flags).not.toContain("decor_policy");
  });

  it("a model draft that quotes a price and a discount is replaced and flagged for approval", async () => {
    const llm = new ScriptedLlm(() => "Hi Meera! The venue is ₹8 lakh per day and we can offer you a 10% discount. Your date is confirmed!");
    ctx = setup(lead({ message: "What's the price?" }), llm);
    ctx.store.setAgent("lead_desk", { autonomy: "act_silently" }); // even fully autonomous…
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.reply!.replacedUnsafeDraft).toBe(true);
    expect(out.result.reply!.source).toBe("template");
    expect(out.result.reply!.body).not.toMatch(/₹|discount|confirmed/i);
    expect(out.result.reply!.flags).toEqual(expect.arrayContaining(["price_quote", "discount_promise", "date_commitment"]));
    expect(out.result.approvalId).not.toBeNull(); // …a flagged draft still needs a human
    expect(ctx.store.approvals[0]!.guardrailFlags).toContain("price_quote");
  });

  it("passes the policy book (not prompt rules) to the model, and reflects a policy edit on the next run", async () => {
    const llm = new ScriptedLlm(() => "Namaste Meera, thank you for your enquiry! Would you like to visit? Warmly, Team Wiwaha");
    ctx = setup(lead(), llm);
    await processLead(ctx.deps, "lead-1");
    expect(llm.calls[0]!.system).toContain("[pricing.phone v1]");
    expect(llm.calls[0]!.model).toBe("claude-haiku-4-5");
    ctx.store.setPolicy("holds.soft_hold", { hours: 48, auto_release: true, notify_client_on_release: true }, "A date can be held for 48 hours without payment.");
    ctx.store.messages = []; // allow a new draft
    await processLead(ctx.deps, "lead-1");
    expect(llm.calls[1]!.system).toContain("[holds.soft_hold v2] Soft holds: A date can be held for 48 hours without payment.");
  });

  it("alerts sales about hot leads", async () => {
    ctx = setup(lead({ source: "wedmegood", guest_count: 250, budget_paise: 45_00_000_00 }));
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.score.hot).toBe(true);
    expect(ctx.store.notifications[0]).toMatchObject({ role: "sales", link: "/team/leads/lead-1" });
  });

  it("act_and_notify skips the queue but still logs and notifies", async () => {
    ctx.store.setAgent("lead_desk", { autonomy: "act_and_notify" });
    const out = await processLead(ctx.deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.approvalId).toBeNull();
    expect(ctx.store.messages[0]!.status).toBe("approved");
    expect(ctx.store.notifications.some((n) => n.title.startsWith("Lead Desk replied"))).toBe(true);
  });

  it("kill switch: a disabled Lead Desk sends the work to the human queue", async () => {
    ctx.store.setAgent("lead_desk", { enabled: false });
    const out = await processLead(ctx.deps, "lead-1");
    expect(out.status).toBe("disabled");
    expect(ctx.store.humanQueue[0]).toMatchObject({ reason: "agent_disabled", leadId: "lead-1" });
    expect(ctx.store.actions[0]).toMatchObject({ status: "skipped_disabled" });
    expect(ctx.store.approvals).toHaveLength(0);
  });

  it("doesn't stack drafts when the family writes twice quickly", async () => {
    await processLead(ctx.deps, "lead-1");
    const second = await processLead(ctx.deps, "lead-1");
    if (second.status !== "done") throw new Error(second.status);
    expect(second.result.skippedReason).toBeDefined();
    expect(ctx.store.approvals).toHaveLength(1);
  });

  it("errors are logged and escalated, not swallowed", async () => {
    const out = await processLead(ctx.deps, "missing-lead");
    expect(out.status).toBe("error");
    expect(ctx.store.actions[0]).toMatchObject({ status: "error" });
    expect(ctx.store.humanQueue[0]).toMatchObject({ reason: "error" });
  });
});

describe("Guardrails", () => {
  const book = PolicyBook.defaults();
  it.each([
    ["The package is ₹12,00,000 all inclusive.", "price_quote"],
    ["Catering is 1,650 per plate.", "price_quote"],
    ["It comes to about 8 lakhs.", "price_quote"],
    ["We can offer you a 15% discount if you book today!", "discount_promise"],
    ["There's a special price for October.", "discount_promise"],
    ["Your date is now confirmed.", "date_commitment"],
    ["We've reserved the lawn for you.", "date_commitment"],
    ["You can bring your own decorator, no problem.", "decor_policy"],
  ])("blocks: %s", (text, flag) => {
    const r = checkClientMessage(text, { book });
    expect(r.ok).toBe(false);
    expect(r.flags).toContain(flag);
  });
  it.each([
    "Namaste! Your date is currently open and we'd love to show you the estate.",
    "We share pricing in person when you visit.",
    "Rooms are complimentary with your booking.",
  ])("allows: %s", (text) => expect(checkClientMessage(text, { book }).ok).toBe(true));
  it("allows a date commitment only when there is an active hold", () => {
    expect(checkClientMessage("Your date is held until Friday.", { book, hasActiveHold: true }).ok).toBe(true);
  });
  it("every template reply passes its own guardrails", () => {
    for (const intents of [["price"], ["discount"], ["rooms", "outside_caterer"], ["outside_decor"], []] as const) {
      for (const outOfTown of [true, false, null]) {
        const body = templateReply(book, { firstName: "A", eventType: "wedding", dateWanted: "2027-01-01", dateLabel: "1 Jan", guests: 200, freeSpaces: [{ name: "Lawn", capacity: 600 }], outOfTown, intents: [...intents], startingFrom: null, hasActiveHold: false });
        expect(checkClientMessage(body, { book }).ok).toBe(true);
      }
    }
  });
});

describe("Prompt hygiene", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  it("prompt.md is bundled verbatim", () => {
    expect(PROMPTS.lead_desk).toBe(readFileSync(join(here, "prompt.md"), "utf8"));
  });
  it("prompt.md contains no business rules (no amounts, percentages or day counts)", () => {
    const md = readFileSync(join(here, "prompt.md"), "utf8");
    expect(md).not.toMatch(/₹|\d+\s*%|\d+\s*(hours|days)|lakh/i);
  });
});

describe("Lead Desk: closed leads", () => {
  it("never drafts a reply to a family that has already booked", async () => {
    const { store, deps } = setup(lead({ status: "won" }));
    const out = await processLead(deps, "lead-1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.skippedReason).toBe("Lead is won");
    expect(store.approvals).toHaveLength(0);
  });
});
