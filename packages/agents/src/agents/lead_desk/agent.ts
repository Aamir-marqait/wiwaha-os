import type { Json, LeadWithContact } from "@wiwaha/db";
import { formatDateIST, rupees, todayIST } from "@wiwaha/db";
import { isOutOfTown, startingFromBand, type PolicyBook, type PolicyKey } from "@wiwaha/policy";
import { checkClientMessage, type GuardrailFlag } from "../../framework/guardrails";
import { decideDelivery, runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps, LlmClient } from "../../framework/types";
import { PROMPTS } from "../../prompts.generated";
import { LEAD_DESK_GATE, replyPriority } from "./gate";
import { detectIntents, scoreLead, type Intent, type ScoreResult } from "./scoring";
import type { LeadDeskStore } from "./tools";

export const LEAD_DESK = "lead_desk";

/** Rules Lead Desk reads for every reply. */
export const LEAD_DESK_POLICIES: readonly PolicyKey[] = [
  "honesty.commitments",
  "pricing.phone",
  "discounts",
  "holds.soft_hold",
  "venue.facts",
  "decor.providers",
  "followup.after_visit",
  "visits.checklist",
  "lead_scoring",
];

export interface ReplyFacts {
  firstName: string;
  eventType: string;
  dateWanted: string | null;
  dateLabel: string | null;
  guests: number | null;
  freeSpaces: { name: string; capacity: number }[] | null;
  outOfTown: boolean | null;
  intents: Intent[];
  startingFrom: { paise: number; label: string } | null;
  hasActiveHold: boolean;
}

export interface LeadDeskResult {
  leadId: string;
  score: ScoreResult;
  intents: Intent[];
  reply: { body: string; source: "llm" | "template"; flags: GuardrailFlag[]; replacedUnsafeDraft: boolean } | null;
  approvalId: string | null;
  messageId: string | null;
  escalations: string[];
  skippedReason?: string;
}

/**
 * Process a new or updated enquiry: score it, alert sales if it's hot, draft a
 * reply and put it through the gate. Safe to call more than once per lead.
 */
export async function processLead(deps: AgentDeps, leadId: string, opts: { force?: boolean } = {}): Promise<RunOutcome<LeadDeskResult>> {
  return runAgent(deps, LEAD_DESK, { action: "process_lead", leadId, input: { lead_id: leadId, force: !!opts.force }, fallbackTitle: "Reply to a new enquiry" }, async (ctx) => {
    const store: LeadDeskStore = deps.store;
    const t0 = Date.now();
    const lead = await store.getLead(leadId);
    if (!lead) throw new Error(`Lead ${leadId} not found`);
    if (["won", "lost", "no_response"].includes(lead.status)) {
      await ctx.log({ action: "process_lead", status: "ok", leadId: lead.id, input: { status: lead.status }, output: { skipped: "lead is closed" } });
      return { leadId: lead.id, score: { score: lead.score ?? 0, hot: lead.hot, breakdown: { date_fit: 0, guest_fit: 0, budget: 0, source: 0, notes: ["Lead is closed"] } }, intents: [], reply: null, approvalId: null, messageId: null, escalations: [], skippedReason: `Lead is ${lead.status.replace("_", " ")}` };
    }

    // 1. Score (deterministic, policy-weighted).
    const today = todayIST(ctx.now);
    const free = lead.date_wanted ? await store.freeSpacesOn(lead.date_wanted, lead.guest_count) : null;
    const score = scoreLead(ctx.book, { lead, freeSpaces: free ? free.length : null, today });
    await store.updateLeadScore(lead.id, score.score, score.breakdown as unknown as Json, score.hot);
    await ctx.log({
      action: "score_lead", status: "ok", leadId: lead.id,
      input: { date_wanted: lead.date_wanted, guest_count: lead.guest_count, budget_paise: lead.budget_paise, source: lead.source, free_spaces: free?.length ?? null },
      output: { score: score.score, hot: score.hot, breakdown: score.breakdown as unknown as Json },
      toolsUsed: ["getLead", "freeSpacesOn", "updateLeadScore"],
      policyKeys: ["lead_scoring"], policyVersions: ctx.book.versions(["lead_scoring"]),
      durationMs: Date.now() - t0,
    });

    // 2. Hot leads go straight to the sales executive (the human gate).
    if (score.hot) {
      const name = lead.contact?.full_name ?? "A new lead";
      await store.notify({
        userId: lead.assigned_to, role: lead.assigned_to ? null : LEAD_DESK_GATE.hotLeadNotifyRole,
        title: `Hot lead: ${name} (${score.score})`,
        body: [lead.date_wanted ? formatDateIST(lead.date_wanted) : null, lead.guest_count ? `${lead.guest_count} guests` : null, lead.source].filter(Boolean).join(" · "),
        link: `/team/leads/${lead.id}`,
      });
    }

    // 3. Don't stack drafts when a family writes twice in a few minutes
    //    (a person pressing "Re-run" forces a fresh draft).
    const recent = opts.force ? 0 : await store.countRecentRepliesForLead(lead.id, new Date(ctx.now.getTime() - 10 * 60_000).toISOString());
    const intents = detectIntents(lead.message);
    if (recent > 0) {
      return { leadId: lead.id, score, intents, reply: null, approvalId: null, messageId: null, escalations: [], skippedReason: "A reply was drafted in the last 10 minutes" };
    }

    // 4. Facts for the reply, and escalations the reply must not answer.
    const facts = buildFacts(ctx.book, lead, free, intents);
    const escalations: string[] = [];
    if (intents.includes("discount")) {
      await store.queueHuman({
        agentKey: LEAD_DESK, reason: "escalation", assignedRole: "owner", leadId: lead.id,
        title: `${lead.contact?.full_name ?? facts.firstName} asked about a discount`,
        detail: `Only Prashanth decides discounts (policy "discounts"). Their message: "${lead.message ?? ""}"`,
      });
      escalations.push("discount");
    }
    if (intents.includes("price") && facts.outOfTown && !facts.startingFrom) {
      await store.queueHuman({
        agentKey: LEAD_DESK, reason: "off_policy", assignedRole: "owner", leadId: lead.id,
        title: `${lead.contact?.full_name ?? "Out-of-town family"} (${lead.city ?? "out of town"}) asked for a starting price`,
        detail: `${lead.contact?.full_name ?? "A family"} (${lead.city ?? "out of town"}) asked about price. Policy allows a "starting from" band for out-of-town families, but no figure is approved yet. Approve one in the policy book or call them back.`,
      });
      escalations.push("starting_from_band_missing");
    }

    // 5. Draft (Claude if available, otherwise the template), then guardrails.
    const draft = await draftReply(ctx, deps.llm, lead, facts);
    const allowed = facts.startingFrom ? [facts.startingFrom.paise] : [];
    let check = checkClientMessage(draft.body, { book: ctx.book, allowedAmountsPaise: allowed, hasActiveHold: facts.hasActiveHold });
    let body = draft.body;
    let source = draft.source;
    let replacedUnsafeDraft = false;
    const firstFlags = check.flags;
    if (!check.ok) {
      // The model's draft broke a rule: fall back to the safe template and say so.
      body = templateReply(ctx.book, facts);
      source = "template";
      replacedUnsafeDraft = true;
      check = checkClientMessage(body, { book: ctx.book, allowedAmountsPaise: allowed, hasActiveHold: facts.hasActiveHold });
    }
    const flags = [...new Set([...firstFlags, ...check.flags])];

    // 6. The gate (autonomy dial + guardrail flags).
    const delivery = decideDelivery(ctx.agent, flags);
    const channel = lead.contact?.phone_e164 ? "whatsapp" : "email";
    const toAddress = channel === "whatsapp" ? lead.contact?.phone_e164 ?? null : lead.contact?.email ?? null;

    const actionId = await ctx.log({
      action: "draft_reply", status: delivery === "approval" ? "gated" : "ok", leadId: lead.id,
      input: { message: lead.message, intents, facts: facts as unknown as Json },
      output: { body, source, flags, replaced_unsafe_draft: replacedUnsafeDraft, reasons: check.reasons, original: replacedUnsafeDraft ? draft.body : null, delivery },
      toolsUsed: ["createMessage", ...(delivery === "approval" ? ["createApproval"] : [])],
      policyKeys: [...LEAD_DESK_POLICIES], policyVersions: ctx.book.versions(LEAD_DESK_POLICIES),
      model: draft.model, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, costUsdMicros: draft.costUsdMicros,
      durationMs: Date.now() - t0,
    });

    let approvalId: string | null = null;
    if (delivery === "approval") {
      approvalId = await store.createApproval({
        kind: LEAD_DESK_GATE.approvalKind,
        title: `Reply to ${lead.contact?.full_name ?? "new enquiry"}`,
        summary: summarise(lead, score, intents, replacedUnsafeDraft),
        agentKey: LEAD_DESK, agentActionId: actionId, leadId: lead.id,
        payload: { body, channel, to: toAddress, enquiry: lead.message, score: score.score, intents },
        priority: replyPriority(score.hot, flags),
        guardrailFlags: flags,
      });
      await deps.store.updateAction(actionId, { approvalId });
    }

    const messageId = await store.createMessage({
      leadId: lead.id, channel, direction: "outbound", authorKind: "agent", agentKey: LEAD_DESK,
      status: delivery === "approval" ? "pending_approval" : "approved",
      approvalId, toAddress, body, metadata: { intents, source, flags },
    });
    if (delivery === "notify") {
      await store.notify({ role: "sales", title: `Lead Desk replied to ${facts.firstName}`, body, link: `/team/leads/${lead.id}` });
    }

    return { leadId: lead.id, score, intents, reply: { body, source, flags, replacedUnsafeDraft }, approvalId, messageId, escalations };
  });
}

function buildFacts(book: PolicyBook, lead: LeadWithContact, free: { name: string; capacity: number }[] | null, intents: Intent[]): ReplyFacts {
  const out = isOutOfTown(book, lead.city ?? lead.contact?.city);
  return {
    firstName: (lead.contact?.full_name ?? "there").split(/\s+/)[0] ?? "there",
    eventType: lead.event_type === "wedding" ? "wedding" : lead.event_type.replace(/_/g, " "),
    dateWanted: lead.date_wanted,
    dateLabel: lead.date_wanted ? formatDateIST(lead.date_wanted, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null,
    guests: lead.guest_count,
    freeSpaces: free,
    outOfTown: out,
    intents,
    startingFrom: out ? startingFromBand(book) : null,
    hasActiveHold: !!lead.hold_expires_at && Date.parse(lead.hold_expires_at) > Date.now(),
  };
}

interface Draft {
  body: string;
  source: "llm" | "template";
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdMicros: number | null;
}

async function draftReply(ctx: RunContext, llm: LlmClient, lead: LeadWithContact, facts: ReplyFacts): Promise<Draft> {
  const template = templateReply(ctx.book, facts);
  if (!llm.available) return { body: template, source: "template", model: null, inputTokens: null, outputTokens: null, costUsdMicros: null };

  const system = `${PROMPTS[LEAD_DESK] ?? ""}\n\n## POLICY BOOK\n${ctx.book.digest(LEAD_DESK_POLICIES)}`;
  const prompt = [
    "FACTS (the only facts you may use):",
    JSON.stringify(
      {
        first_name: facts.firstName,
        event_type: facts.eventType,
        date_wanted: facts.dateLabel,
        date_status: facts.dateWanted === null ? "no date given" : facts.freeSpaces && facts.freeSpaces.length > 0 ? "currently open" : "already taken",
        spaces_that_fit: facts.freeSpaces?.map((s) => `${s.name} (seats ${s.capacity})`) ?? [],
        guests: facts.guests,
        family_is_out_of_town: facts.outOfTown,
        approved_starting_from_band: facts.startingFrom ? rupees(facts.startingFrom.paise) : null,
        active_hold: facts.hasActiveHold,
        they_asked_about: facts.intents,
        channel: lead.contact?.phone_e164 ? "WhatsApp" : "email",
      },
      null,
      2,
    ),
    "",
    "THEIR MESSAGE:",
    lead.message?.trim() || "(No message, just the enquiry form.)",
    "",
    "Write the reply.",
  ].join("\n");

  try {
    const res = await llm.complete({ model: ctx.agent.model, system, prompt, maxTokens: 1500, effort: "low" });
    const body = res.text.trim();
    if (!body) throw new Error("empty reply");
    return { body, source: "llm", model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsdMicros: res.costUsdMicros };
  } catch {
    return { body: template, source: "template", model: ctx.agent.model, inputTokens: null, outputTokens: null, costUsdMicros: null };
  }
}

/**
 * Safe reply built only from facts and the policy book. Used without an API
 * key, and whenever a model draft breaks a guardrail.
 */
export function templateReply(book: PolicyBook, f: ReplyFacts): string {
  const venue = book.get("venue.facts");
  const pricing = book.get("pricing.phone");
  const parts: string[] = [];
  parts.push(`Namaste ${f.firstName}, thank you so much for thinking of Wiwaha by Praman for your ${f.eventType}!`);

  if (f.dateWanted && f.freeSpaces) {
    if (f.freeSpaces.length > 0) {
      const names = f.freeSpaces.slice(0, 2).map((s) => s.name).join(" and ");
      parts.push(`${f.dateLabel} is currently open${f.guests ? `, and ${names} can comfortably host ${f.guests} guests` : ""}.`);
    } else {
      parts.push(`${f.dateLabel} is already spoken for, but we'd love to suggest dates close to it.`);
    }
  } else if (f.intents.includes("availability") || !f.dateWanted) {
    parts.push("Do share the date you have in mind and we'll check it for you right away.");
  }

  if (f.intents.includes("rooms")) {
    parts.push(`The estate has ${venue.rooms_now} guest rooms${venue.complimentary_rooms_with_booking ? ", complimentary with your booking" : ""}.`);
  }
  if (f.intents.includes("outside_caterer")) {
    parts.push(venue.outside_caterer_allowed ? "You're welcome to bring your own caterer; our team will walk you through how that works." : "Catering is handled by our in-house team.");
  }
  if (f.intents.includes("outside_decor")) {
    parts.push("Décor here is created by our in-house team or a designated planner, and we'll happily show you what's possible.");
  }

  if (f.intents.includes("price") || f.intents.includes("discount")) {
    if (f.outOfTown && f.startingFrom) {
      parts.push(`Celebrations here start from ${rupees(f.startingFrom.paise)}, and we'll send you our brochure and a video tour on WhatsApp.`);
    } else if (f.outOfTown) {
      parts.push("Since every celebration is shaped around your family, a member of our team will get back to you personally on pricing, and we can share a video tour of the estate.");
    } else {
      parts.push("Every celebration here is shaped around your family, so we share pricing in person, and the team will personally take you through everything when you visit.");
    }
  }

  if (f.outOfTown) {
    parts.push(pricing.send_video_tour ? "If a trip isn't easy right now, we'd be glad to arrange a video walkthrough." : "We'd be glad to welcome you whenever you're in Bengaluru.");
  } else {
    parts.push(`Would you like to visit the estate? We're just ${venue.airport_distance_km} km from the airport. Reply with a day that suits you and we'll arrange it.`);
  }
  parts.push("Warmly,\nTeam Wiwaha");
  return parts.join(" ").replace(" Warmly,", "\n\nWarmly,");
}

function summarise(lead: LeadWithContact, score: ScoreResult, intents: Intent[], replaced: boolean): string {
  const bits = [`Score ${score.score}${score.hot ? " (hot)" : ""}`, lead.source];
  if (lead.date_wanted) bits.push(formatDateIST(lead.date_wanted));
  if (lead.guest_count) bits.push(`${lead.guest_count} guests`);
  if (intents.length) bits.push(`asked about ${intents.join(", ")}`);
  if (replaced) bits.push("AI draft broke a rule and was replaced with the safe template");
  return bits.join(" · ");
}

/** Drafts a note to a family whose soft hold lapsed (routed by Chief of Staff). */
export async function draftHoldReleased(deps: AgentDeps, leadId: string, payload: { starts_on?: string; label?: string | null }): Promise<RunOutcome<{ approvalId: string | null }>> {
  return runAgent(deps, LEAD_DESK, { action: "hold_released_note", leadId, input: payload as Json, fallbackTitle: "Tell a family their date hold lapsed" }, async (ctx) => {
    const lead = await deps.store.getLead(leadId);
    if (!lead) throw new Error(`Lead ${leadId} not found`);
    const name = (lead.contact?.full_name ?? "there").split(/\s+/)[0];
    const when = payload.starts_on ? formatDateIST(payload.starts_on, { day: "numeric", month: "long", year: "numeric" }) : "your date";
    const body = `Namaste ${name}, a gentle note from Wiwaha: the courtesy hold on ${when} has now lapsed, so the date is open to other families again. If you'd still like it, just reply and we'll check it for you straight away.\n\nWarmly,\nTeam Wiwaha`;
    const check = checkClientMessage(body, { book: ctx.book });
    const delivery = decideDelivery(ctx.agent, check.flags);
    const actionId = await ctx.log({ action: "hold_released_note", status: delivery === "approval" ? "gated" : "ok", leadId, input: payload as Json, output: { body, delivery }, policyKeys: ["holds.soft_hold"], policyVersions: ctx.book.versions(["holds.soft_hold"]) });
    let approvalId: string | null = null;
    if (delivery === "approval") {
      approvalId = await deps.store.createApproval({ kind: "lead_reply", title: `Hold lapsed: tell ${lead.contact?.full_name ?? "the family"}`, agentKey: LEAD_DESK, agentActionId: actionId, leadId, payload: { body, channel: "whatsapp", to: lead.contact?.phone_e164 ?? null }, priority: 2, guardrailFlags: check.flags });
      await deps.store.updateAction(actionId, { approvalId });
    }
    await deps.store.createMessage({ leadId, channel: "whatsapp", direction: "outbound", authorKind: "agent", agentKey: LEAD_DESK, status: delivery === "approval" ? "pending_approval" : "approved", approvalId, toAddress: lead.contact?.phone_e164 ?? null, body });
    return { approvalId };
  });
}
