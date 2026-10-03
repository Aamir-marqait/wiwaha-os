import type { Json, MessageChannel } from "@wiwaha/db";
import { addDays, formatDateIST, rupees } from "@wiwaha/db";
import { decorUnlockLabel, type PolicyKey } from "@wiwaha/policy";
import { where } from "../../framework/db";
import { agentDb, istDate, proposeClientMessage, writeText } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { WEDDING_ROOM_GATE } from "./gate";
import { WEDDING_ROOM_TOOLS } from "./tools";

export const WEDDING_ROOM = "wedding_room";

type Topic = "decision" | "payment" | "dates" | "stages" | "rooms" | "catering" | "decor_early" | "decor" | "price" | "discount" | "thanks" | "unknown";

const DECISION = /\b(we('ve| have)? decided|final(i[sz]e[d]?|ly)?\b|let'?s go with|go ahead with|we('ll| will) (take|go with)|we choose|confirmed?)\b/i;
const PATTERNS: [Topic, RegExp][] = [
  ["discount", /\b(discount|cheaper|reduce the (price|cost)|waive|concession)\b/i],
  ["price", /\b(price|cost|how much (is|does|for)|rate|charges?)\b/i],
  ["payment", /\b(payment|pay|due|instal+ment|deposit|balance|receipt)\b/i],
  ["decor_early", /\b(start|begin|see|send)\b.*\b(d[eé]cor|mood ?boards?|design)\b|\b(d[eé]cor|mood ?boards?)\b.*\b(now|early|already|yet)\b/i],
  ["decor", /\b(d[eé]cor|decorat\w*|flowers?|mandap|mood ?boards?)\b/i],
  ["dates", /\b(when is|what time|timing|schedule|date of|functions?|haldi|mehendi|sangeet|reception)\b/i],
  ["stages", /\b(status|progress|what'?s next|next step|pending|waiting)\b/i],
  ["rooms", /\b(rooms?|stay|accommodat\w*|check.?in)\b/i],
  ["catering", /\b(caterer|catering|food|menu|tasting)\b/i],
  ["thanks", /^(thanks|thank you|thx|great|perfect|ok(ay)?|sure|👍|🙏)[\s!.]*$/i],
];

export function classify(text: string): Topic {
  if (DECISION.test(text)) return "decision";
  return PATTERNS.find(([, re]) => re.test(text))?.[0] ?? "unknown";
}

const POLICIES: readonly PolicyKey[] = ["honesty.commitments", "payments.schedule", "decor.providers", "moodboards", "planning.start", "menus.rules", "rooms.operations", "venue.facts", "onboarding.welcome", "portal.nudges"];

/** A message from the family (WhatsApp group or portal chat). */
export async function onFamilyMessage(deps: AgentDeps, messageId: string): Promise<RunOutcome<{ topic: Topic; escalated: boolean }>> {
  return runAgent(deps, WEDDING_ROOM, { action: "family_message", input: { message_id: messageId }, fallbackTitle: "Answer the family in their Wedding Room" }, async (ctx) => {
    const db = agentDb(ctx, WEDDING_ROOM_TOOLS);
    const [m] = await db.select<{ id: string; wedding_id: string; channel: MessageChannel; body: string; metadata: Record<string, unknown> | null; author_user_id: string | null }>("messages", { where: { id: messageId } });
    if (!m?.wedding_id) throw new Error("Message not found");
    const [w] = await db.select<{ id: string; title: string; event_start: string; event_end: string; complimentary_rooms: number; event_manager_id: string | null }>("weddings", { where: { id: m.wedding_id } });
    const [em] = w?.event_manager_id ? await db.select<{ full_name: string }>("profiles", { where: { id: w.event_manager_id } }) : [];
    const emName = em?.full_name.split(" ")[0] ?? "your event manager";
    const topic = classify(m.body);
    const from = typeof m.metadata?.from === "string" ? m.metadata.from : null;
    const replyChannel: MessageChannel = m.channel === "portal" ? "portal" : "whatsapp";
    let reply: string | null = null;
    let escalated = false;
    let allowed: number[] = [];

    if (topic === "thanks") {
      await ctx.log({ action: "family_message", status: "ok", weddingId: m.wedding_id, input: { topic }, output: { reply: null } });
      return { topic, escalated };
    }
    if (topic === "decision") {
      const subject = (PATTERNS.find(([t, re]) => !["price", "discount", "thanks"].includes(t) && re.test(m.body))?.[0] ?? "general").replace("decor_early", "decor");
      await db.insert("wedding_decisions", { wedding_id: m.wedding_id, topic: subject, decision: m.body.slice(0, 1000), decided_by_name: typeof m.metadata?.name === "string" ? m.metadata.name : null, source: m.channel === "portal" ? "portal" : "whatsapp", message_id: m.id, logged_by_agent: WEDDING_ROOM });
      reply = `Noted with thanks. We've logged this in your Wedding Room and ${emName} will take it from here.`;
    } else if (topic === "payment") {
      const pays = await db.select<{ label: string; amount_paise: number; due_on: string; status: string; link_url: string | null }>("payments", { where: { wedding_id: m.wedding_id }, order: [{ column: "sort" }] });
      const next = pays.find((p) => p.status !== "paid");
      allowed = pays.map((p) => p.amount_paise);
      reply = next ? `Your next payment is ${next.label.toLowerCase()}: ${rupees(next.amount_paise)}, due on ${formatDateIST(next.due_on)}.${next.link_url ? ` You can pay here: ${next.link_url}` : " The payment link will reach you before the due date."}` : "All your payments are complete. Thank you!";
    } else if (topic === "dates") {
      const fns = await db.select<{ name: string; date: string; start_time: string | null }>("event_functions", { where: { wedding_id: m.wedding_id }, order: [{ column: "date" }, { column: "start_time" }] });
      reply = fns.length ? `Here's your schedule: ${fns.map((f) => `${f.name} on ${formatDateIST(f.date, { weekday: "short", day: "numeric", month: "short" })}${f.start_time ? ` at ${f.start_time.slice(0, 5)}` : ""}`).join("; ")}.` : `Your celebration is on ${formatDateIST(w!.event_start)}${w!.event_end !== w!.event_start ? ` to ${formatDateIST(w!.event_end)}` : ""}. Function timings will appear here once your brief is complete.`;
    } else if (topic === "stages") {
      const stages = await db.select<{ name: string; status: string }>("wedding_stages", { where: { wedding_id: m.wedding_id }, order: [{ column: "sort" }] });
      const active = stages.filter((s) => ["in_progress", "awaiting_client"].includes(s.status)).map((s) => s.name);
      const open = stages.filter((s) => s.status === "not_started").map((s) => s.name);
      reply = `${active.length ? `In progress: ${active.join(", ")}. ` : ""}${open.length ? `Ready whenever you are: ${open.join(", ")}.` : ""}`.trim() || "Everything is on track. Your portal shows each stage as it opens.";
    } else if (topic === "rooms") {
      const r = ctx.book.get("rooms.operations");
      reply = `Your booking includes ${w!.complimentary_rooms} complimentary rooms. Check-in is from ${r.check_in_time} and check-out by ${r.check_out_time}. You can add your rooming list in the portal under Guests & rooms.`;
    } else if (topic === "catering") {
      const r = ctx.book.get("menus.rules");
      reply = `Our kitchen offers ${r.cuisines.join(", ")}, or you're welcome to bring your own caterer (${r.outside_caterer_rules.charAt(0).toLowerCase()}${r.outside_caterer_rules.slice(1)}) Menus and tastings are in your portal under Menus & tasting.`;
    } else if (topic === "decor_early" || topic === "decor") {
      const [stage] = await db.select<{ status: string; started_at: string | null }>("wedding_stages", { where: { wedding_id: m.wedding_id, key: "decor" } });
      const unlock = decorUnlockLabel(ctx.book);
      reply = stage?.status === "locked" && unlock
        ? `Décor design and moodboards open once ${unlock} is made, and then you can start whenever you like. ${ctx.book.ruleText("decor.providers")}`
        : stage?.started_at ? "Your moodboards are in the portal under Décor & moodboards. Shortlist the ones you love and we'll refine them." : "Décor is open for you: press Start on Décor & moodboards in your portal whenever you're ready.";
    } else if (topic === "discount") {
      await deps.store.queueHuman({ agentKey: WEDDING_ROOM, reason: "escalation", assignedRole: "owner", weddingId: m.wedding_id, title: `${w!.title} asked about a discount`, detail: m.body });
      escalated = true;
      reply = `I'm not able to make any promises on that, but I've passed it to the team and ${emName} will get back to you.`;
    } else if (topic === "price") {
      await deps.store.queueHuman({ agentKey: WEDDING_ROOM, reason: "escalation", assignedRole: WEDDING_ROOM_GATE.escalateTo, weddingId: m.wedding_id, title: `${w!.title} asked about a price`, detail: m.body });
      escalated = true;
      reply = `Every price is in your quote in the portal. For anything new, ${emName} will check and come back to you.`;
    }

    if (reply === null) {
      // Not something the record or policy book answers directly: try the model with the facts, else escalate.
      const facts = { couple: w!.title, event_dates: [w!.event_start, w!.event_end], complimentary_rooms: w!.complimentary_rooms, event_manager: emName, question: m.body };
      const written = await writeText(ctx, { policies: POLICIES, facts, task: `Answer the family's question only if the facts or client-visible rules answer it. Otherwise reply exactly: "Let me check that with ${emName} and come back to you."`, template: `Let me check that with ${emName} and come back to you.`, clientFacing: true, guard: { allowedAmountsPaise: allowed } });
      reply = written.body;
      if (written.source === "template" || /check (that|this) with/i.test(written.body)) {
        await deps.store.queueHuman({ agentKey: WEDDING_ROOM, reason: "off_policy", assignedRole: WEDDING_ROOM_GATE.escalateTo, weddingId: m.wedding_id, title: `${w!.title} asked something the Wedding Room couldn't answer`, detail: m.body });
        escalated = true;
      }
    }
    await proposeClientMessage(ctx, { channel: replyChannel, to: replyChannel === "portal" ? null : from, weddingId: m.wedding_id, approvalKind: WEDDING_ROOM_GATE.messageApproval, title: `Reply in ${w!.title}'s Wedding Room`, summary: m.body.slice(0, 120), body: reply, clientVisible: true });
    await ctx.log({ action: "family_message", status: escalated ? "escalated" : "gated", weddingId: m.wedding_id, input: { message: m.body, topic }, output: { reply } as Json, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { topic, escalated };
  });
}

/** Stage cards not started by their recommended date: one gentle nudge, then a call task. */
export async function nudgeStages(deps: AgentDeps): Promise<RunOutcome<{ nudged: number; calls: number }>> {
  return runAgent(deps, WEDDING_ROOM, { action: "nudge_stages", input: {}, fallbackTitle: "Nudge couples about planning stages" }, async (ctx) => {
    const db = agentDb(ctx, WEDDING_ROOM_TOOLS);
    const rules = ctx.book.get("portal.nudges");
    const today = istDate(ctx.now);
    const due = await db.select<{ id: string; wedding_id: string; name: string; recommended_start: string | null; nudged_at: string | null; escalated_at: string | null; snoozed_until: string | null }>("wedding_stages", {
      where: { status: "not_started", started_at: where.isNull(), recommended_start: where.lte(addDays(today, -rules.nudge_days_after_recommended)) },
    });
    let nudged = 0, calls = 0;
    for (const s of due) {
      if (s.snoozed_until && s.snoozed_until >= today) continue;
      const [w] = await db.select<{ title: string; primary_contact_id: string | null; event_manager_id: string | null; status: string }>("weddings", { where: { id: s.wedding_id } });
      if (!w || w.status !== "active") continue;
      if (!s.nudged_at) {
        const [c] = w.primary_contact_id ? await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
        await proposeClientMessage(ctx, { channel: c?.phone_e164 ? "whatsapp" : "portal", to: c?.phone_e164 ?? null, weddingId: s.wedding_id, approvalKind: WEDDING_ROOM_GATE.messageApproval, title: `Gentle nudge: ${s.name} (${w.title})`, body: `Namaste ${c?.full_name.split(" ")[0] ?? ""}, whenever you're ready, "${s.name}" is open in your portal. There's no rush, and if you'd like to wait, you can snooze it there with a quick note.\n\nWarmly,\nTeam Wiwaha`.replace("Namaste ,", "Namaste,") });
        await db.update("wedding_stages", { id: s.id }, { nudged_at: ctx.now.toISOString() });
        nudged++;
      } else if (!s.escalated_at && addDays(s.nudged_at.slice(0, 10), rules.call_task_days_after_nudge) <= today) {
        await db.insert("tasks", { scope: "wedding", wedding_id: s.wedding_id, title: `Call ${w.title} about "${s.name}"`, description: "Nudged once in the portal; not started yet. A friendly call to see how we can help.", owner_id: w.event_manager_id, owner_role: "event_manager", due_at: new Date(ctx.now.getTime() + 86_400_000).toISOString(), priority: "normal", proof_kind: "tick", created_by_agent: WEDDING_ROOM });
        await db.update("wedding_stages", { id: s.id }, { escalated_at: ctx.now.toISOString() });
        calls++;
      }
    }
    await ctx.log({ action: "nudge_stages", status: "ok", input: { today }, output: { nudged, calls }, policyKeys: ["portal.nudges"], policyVersions: ctx.book.versions(["portal.nudges"]) });
    return { nudged, calls };
  });
}
