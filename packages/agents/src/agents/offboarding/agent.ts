import type { Json, MessageChannel } from "@wiwaha/db";
import { addDays } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { where } from "../../framework/db";
import { agentDb, claimRun, istDate, istInstant, proposeClientMessage, writeText } from "../../framework/kit";
import { runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { OFFBOARDING_GATE } from "./gate";
import { OFFBOARDING_TOOLS } from "./tools";

export const OFFBOARDING = "offboarding";
const POLICIES: readonly PolicyKey[] = ["farewell", "offboarding.sequence", "reviews.after_event", "honesty.commitments"];
type StepKey = "thank_you" | "photo_sharing" | "review_form" | "parting_gift" | "newsletter" | "referral_ask";

interface Wedding { id: string; title: string; event_start: string; event_end: string; primary_contact_id: string | null; event_manager_id: string | null; stage: string; status: string }
interface Contact { id: string; full_name: string; phone_e164: string | null; email: string | null; consent_email: boolean; newsletter_opt_in: boolean }

/** Close-out started: schedule each farewell step on its day (policy "offboarding.sequence"). */
export async function scheduleOffboarding(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ scheduled: number }>> {
  return runAgent(deps, OFFBOARDING, { action: "schedule_offboarding", weddingId, input: {}, fallbackTitle: "Schedule the farewell sequence" }, async (ctx) => {
    const db = agentDb(ctx, OFFBOARDING_TOOLS);
    const [w] = await db.select<Wedding>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const seq = ctx.book.get("offboarding.sequence");
    const have = await db.select<{ key: string }>("offboarding_steps", { where: { wedding_id: weddingId } });
    const rows = seq.steps.filter((s) => !have.some((h) => h.key === s.key)).map((s) => ({ wedding_id: weddingId, key: s.key, due_on: addDays(w.event_end, s.days_after_event), status: "scheduled" }));
    if (rows.length) await db.insert("offboarding_steps", rows);
    const review = await db.select("reviews", { where: { wedding_id: weddingId } });
    if (!review.length) await db.insert("reviews", { wedding_id: weddingId, contact_id: w.primary_contact_id });
    if (w.stage !== "offboarding") await db.update("weddings", { id: weddingId }, { stage: "offboarding" });
    await ctx.log({ action: "schedule_offboarding", status: "ok", weddingId, input: {}, output: { scheduled: rows.length } as Json, policyKeys: ["offboarding.sequence"], policyVersions: ctx.book.versions(["offboarding.sequence"]) });
    return { scheduled: rows.length };
  });
}

async function compose(ctx: RunContext, key: StepKey, w: Wedding, c: Contact, link: string): Promise<{ body: string; channel: MessageChannel; subject: string } | null> {
  const first = c.full_name.split(" ")[0];
  const farewell = ctx.book.get("farewell");
  const templates: Record<StepKey, { channel: MessageChannel; subject: string; text: string } | null> = {
    thank_you: farewell.thank_you_note ? { channel: c.phone_e164 ? "whatsapp" : "email", subject: "Thank you", text: `Dear ${first},\n\nThank you for letting us be part of your celebration. It was an honour to host your family at Wiwaha, and we hope the memories stay with you for a lifetime.\n\nWith love,\nTeam Wiwaha` } : null,
    photo_sharing: { channel: c.phone_e164 ? "whatsapp" : "email", subject: "Your photos", text: `Dear ${first},\n\nYour Memories page is open in your portal, where you can share photos with your family and see what your photographer sends: ${link}/portal\n\nWarmly,\nTeam Wiwaha` },
    review_form: null, // composed below: personalised link, email only
    parting_gift: { channel: c.phone_e164 ? "whatsapp" : "email", subject: "A little something", text: `Dear ${first},\n\nA small parting gift from all of us at Wiwaha is on its way to you, with our thanks.\n\nWarmly,\nTeam Wiwaha` },
    newsletter: farewell.add_to_newsletter ? { channel: "email", subject: "Staying in touch", text: `Dear ${first},\n\nWe'd love to stay in touch. Every few weeks we share stories from the estate, seasonal menus and celebrations we've hosted. You can unsubscribe any time.\n\nWarmly,\nTeam Wiwaha` } : null,
    referral_ask: farewell.referral_ask ? { channel: c.phone_e164 ? "whatsapp" : "email", subject: "Know someone planning a celebration?", text: `Dear ${first},\n\nIf a friend or family member is planning a wedding, we'd be honoured if you passed on our name. We'd look after them as warmly as we looked after you.\n\nWarmly,\nTeam Wiwaha` } : null,
  };
  if (key === "review_form") return null;
  const t = templates[key];
  if (!t) return null;
  if (t.channel === "email" && !c.email) return null;
  const text = await writeText(ctx, { policies: POLICIES, facts: { first_name: first, couple: w.title, step: key, link: key === "photo_sharing" ? `${link}/portal` : null }, task: `Write the "${key.replace("_", " ")}" message for this couple.`, template: t.text, clientFacing: true });
  return { body: text.body, channel: t.channel, subject: t.subject };
}

/** Daily: draft the steps that are due, in order, once each. */
export async function sendOffboardingSteps(deps: AgentDeps): Promise<RunOutcome<{ drafted: number; tasks: number }>> {
  return runAgent(deps, OFFBOARDING, { action: "offboarding_steps", input: {}, fallbackTitle: "Send farewell steps" }, async (ctx) => {
    const db = agentDb(ctx, OFFBOARDING_TOOLS);
    const today = istDate(ctx.now);
    const order = ctx.book.get("offboarding.sequence").steps.map((s) => s.key);
    const due = await db.select<{ id: string; wedding_id: string; key: StepKey; due_on: string; status: string }>("offboarding_steps", { where: { status: "scheduled", due_on: where.lte(today) } });
    const link = deps.channels?.appUrl ?? "";
    let drafted = 0, tasks = 0;
    for (const weddingId of [...new Set(due.map((d) => d.wedding_id))]) {
      const [w] = await db.select<Wedding>("weddings", { where: { id: weddingId } });
      const [c] = w?.primary_contact_id ? await db.select<Contact>("contacts", { where: { id: w.primary_contact_id } }) : [];
      if (!w || !c) continue;
      const steps = due.filter((d) => d.wedding_id === weddingId).sort((a, b) => a.due_on.localeCompare(b.due_on) || order.indexOf(a.key) - order.indexOf(b.key));
      for (const s of steps) {
        let messageId: string | null = null, approvalId: string | null = null, status = "drafted";
        if (s.key === "review_form") {
          const [r] = await db.select<{ id: string; form_token: string | null; form_sent_at: string | null }>("reviews", { where: { wedding_id: weddingId } });
          if (c.email && r?.form_token) {
            const p = await proposeClientMessage(ctx, { channel: "email", to: c.email, subject: `${c.full_name.split(" ")[0]}, how was your celebration?`, weddingId, approvalKind: OFFBOARDING_GATE.messageApproval, title: `Review form for ${w.title}`, body: `Dear ${c.full_name.split(" ")[0]},\n\nWe'd love to hear how ${w.title}'s celebration felt for you and your family. It takes two minutes: ${link}/review/${r.form_token}\n\nThank you,\nTeam Wiwaha` });
            messageId = p.messageId; approvalId = p.approvalId;
            await db.update("reviews", { id: r.id }, { form_sent_at: ctx.now.toISOString() });
          } else status = "skipped";
        } else {
          if (s.key === "parting_gift") {
            const f = ctx.book.get("farewell");
            await db.insert("tasks", { scope: "wedding", wedding_id: weddingId, title: `Send the parting gift to ${w.title}`, description: `Options (policy): ${f.gift_options.map((g) => g.replace("_", " ")).join(" or ")}${f.gift_budget_paise ? `, within the gift budget` : ""}. Tick when dispatched.`, owner_id: w.event_manager_id, owner_role: "event_manager", due_at: istInstant(today, "17:00"), priority: "normal", proof_kind: "tick", created_by_agent: OFFBOARDING });
            tasks++;
          }
          if (s.key === "newsletter" && c.consent_email && !c.newsletter_opt_in) await db.update("contacts", { id: c.id }, { newsletter_opt_in: true });
          const m = await compose(ctx, s.key, w, c, link);
          if (m) {
            const p = await proposeClientMessage(ctx, { channel: m.channel, to: m.channel === "email" ? c.email : c.phone_e164, subject: m.subject, weddingId, approvalKind: OFFBOARDING_GATE.messageApproval, title: `${m.subject} (${w.title})`, body: m.body });
            messageId = p.messageId; approvalId = p.approvalId;
          } else status = "skipped";
        }
        await db.update("offboarding_steps", { id: s.id }, { status, message_id: messageId, approval_id: approvalId, sent_at: status === "drafted" ? ctx.now.toISOString() : null });
        if (status === "drafted") drafted++;
      }
    }
    await ctx.log({ action: "offboarding_steps", status: drafted ? "gated" : "ok", input: { today }, output: { drafted, tasks }, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { drafted, tasks };
  });
}

/** Yearly: anniversary wishes on the wedding date (policy "offboarding.sequence"). */
export async function anniversaryWishes(deps: AgentDeps): Promise<RunOutcome<{ drafted: number }>> {
  return runAgent(deps, OFFBOARDING, { action: "anniversary_wishes", input: {}, fallbackTitle: "Anniversary wishes" }, async (ctx) => {
    const db = agentDb(ctx, OFFBOARDING_TOOLS);
    if (!ctx.book.get("offboarding.sequence").anniversary_wishes) return { drafted: 0 };
    const today = istDate(ctx.now);
    const weddings = await db.select<Wedding>("weddings", { where: { status: where.in(["active", "completed"]), event_start: where.lt(today) } });
    let drafted = 0;
    for (const w of weddings.filter((x) => x.event_start.slice(5, 10) === today.slice(5, 10))) {
      if (!(await claimRun(db, "anniversary", `${w.id}:${today.slice(0, 4)}`))) continue;
      const [c] = w.primary_contact_id ? await db.select<Contact>("contacts", { where: { id: w.primary_contact_id } }) : [];
      if (!c?.phone_e164 && !c?.email) continue;
      const years = Number(today.slice(0, 4)) - Number(w.event_start.slice(0, 4));
      await proposeClientMessage(ctx, { channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, subject: "Happy anniversary", weddingId: w.id, approvalKind: OFFBOARDING_GATE.messageApproval, title: `Anniversary wishes: ${w.title}`, body: `Dear ${c.full_name.split(" ")[0]},\n\nHappy ${years === 1 ? "first " : ""}anniversary from all of us at Wiwaha! We still smile thinking of your celebration on the estate. Wishing you both many more beautiful years.\n\nWith love,\nTeam Wiwaha` });
      drafted++;
    }
    await ctx.log({ action: "anniversary_wishes", status: drafted ? "gated" : "ok", input: { today }, output: { drafted } });
    return { drafted };
  });
}
