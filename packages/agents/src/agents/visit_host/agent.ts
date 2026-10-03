import type { Json } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { formatSlot } from "../../domain/visits";
import { where } from "../../framework/db";
import { agentDb, alertStaff, proposeClientMessage, writeText } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { VISIT_HOST_GATE } from "./gate";
import { VISIT_HOST_TOOLS } from "./tools";

export const VISIT_HOST = "visit_host";
const POLICIES: readonly PolicyKey[] = ["honesty.commitments", "visits.booking", "visits.checklist", "venue.facts", "followup.after_visit"];

interface VisitRow { id: string; lead_id: string; scheduled_at: string; executive_id: string | null; attendees: string | null; attendee_count: number | null; status: string; notes: string | null; reminder_sent_at: string | null }
interface LeadRow { id: string; contact_id: string; status: string; date_wanted: string | null; guest_count: number | null; message: string | null; city: string | null; source: string }
interface ContactRow { full_name: string; phone_e164: string | null; email: string | null }

async function load(db: ReturnType<typeof agentDb>, visitId: string) {
  const [visit] = await db.select<VisitRow>("visits", { where: { id: visitId } });
  if (!visit) throw new Error(`Visit ${visitId} not found`);
  const [lead] = await db.select<LeadRow>("leads", { where: { id: visit.lead_id } });
  const [contact] = lead ? await db.select<ContactRow>("contacts", { where: { id: lead.contact_id } }) : [];
  const [exec] = visit.executive_id ? await db.select<{ id: string; full_name: string }>("profiles", { where: { id: visit.executive_id } }) : [];
  return { visit, lead: lead!, contact: contact ?? null, exec: exec ?? null };
}

/** After a visit is booked: brief the executive, draft the family's confirmation with the location pin. */
export async function onVisitBooked(deps: AgentDeps, visitId: string): Promise<RunOutcome<{ approvalId: string | null }>> {
  return runAgent(deps, VISIT_HOST, { action: "visit_booked", input: { visit_id: visitId }, fallbackTitle: "Confirm a booked site visit with the family" }, async (ctx) => {
    const db = agentDb(ctx, VISIT_HOST_TOOLS);
    const { visit, lead, contact, exec } = await load(db, visitId);
    const booking = ctx.book.get("visits.booking");
    const checklist = ctx.book.get("visits.checklist");
    const when = formatSlot(visit.scheduled_at);
    const first = contact?.full_name.split(" ")[0] ?? "there";

    // 1. Pre-visit brief to the executive (internal).
    const briefTemplate = [
      `Visit: ${contact?.full_name ?? "a family"} on ${when}`,
      visit.attendees ? `Coming: ${visit.attendees}${visit.attendee_count ? ` (${visit.attendee_count})` : ""}` : null,
      lead.date_wanted ? `Wedding date wanted: ${lead.date_wanted}` : "Wedding date: not given yet",
      lead.guest_count ? `Guests: ${lead.guest_count}` : null,
      lead.city ? `Family based in: ${lead.city}` : null,
      `Came in via: ${lead.source.replace(/_/g, " ")}`,
      lead.message ? `They asked: "${lead.message.slice(0, 300)}"` : null,
      `Checklist: ${checklist.items.map((i) => i.label).join(" · ")}`,
    ].filter(Boolean).join("\n");
    const brief = await writeText(ctx, { policies: POLICIES, facts: { brief: briefTemplate }, task: "Rewrite this pre-visit brief for the executive: same facts, tidy short lines, add one line on what to show them first based on what they asked. Plain text.", template: briefTemplate, clientFacing: false, maxTokens: 400 });
    await db.update("visits", { id: visit.id }, { pre_visit_brief: brief.body, brief_sent_at: ctx.now.toISOString() });
    if (exec) await alertStaff(deps, { userIds: [exec.id], title: `Pre-visit brief: ${contact?.full_name ?? "site visit"}`, body: brief.body, link: `/team/leads/${lead.id}`, whatsapp: true, leadId: lead.id });

    // 2. Confirmation to the family (gated in draft).
    const loc = booking.location_pin_url ? { name: booking.location_name, url: booking.location_pin_url } : null;
    const template = `Namaste ${first}, your visit to Wiwaha by Praman is confirmed for ${when}. ${exec ? `${exec.full_name.split(" ")[0]} will host you` : "Our team will host you"} and show you around the estate.${loc ? ` Here is the location: ${loc.url}` : ` We're at ${booking.location_name}.`} We look forward to welcoming your family.\n\nWarmly,\nTeam Wiwaha`;
    const text = await writeText(ctx, { policies: POLICIES, facts: { first_name: first, when, host: exec?.full_name ?? null, location: booking.location_name, location_pin: loc?.url ?? null }, task: "Write the WhatsApp confirmation of this site visit for the family. Include the date and time, the host's first name and the location pin if given.", template, clientFacing: true, guard: { hasActiveHold: false } });
    const channel = contact?.phone_e164 ? "whatsapp" : "email";
    const proposed = await proposeClientMessage(ctx, {
      channel, to: contact?.phone_e164 ?? contact?.email ?? null, subject: "Your visit to Wiwaha by Praman", body: text.body, leadId: lead.id,
      approvalKind: VISIT_HOST_GATE.approvalKind, title: `Visit confirmation for ${contact?.full_name ?? "a family"}`, summary: when, flags: text.flags,
      metadata: loc ? { location: loc } : {},
    });
    await db.update("visits", { id: visit.id }, { confirmation_sent_at: ctx.now.toISOString() });
    await ctx.log({ action: "visit_booked", status: proposed.approvalId ? "gated" : "ok", leadId: lead.id, subjectTable: "visits", subjectId: visit.id, input: { visit_id: visit.id }, output: { brief: brief.body, confirmation: text.body, approval_id: proposed.approvalId } as Json, model: text.model, inputTokens: text.inputTokens, outputTokens: text.outputTokens, costUsdMicros: text.costUsdMicros, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { approvalId: proposed.approvalId };
  });
}

/** Day-before reminders for scheduled visits (once per visit). */
export async function sendVisitReminders(deps: AgentDeps): Promise<RunOutcome<{ drafted: number }>> {
  return runAgent(deps, VISIT_HOST, { action: "visit_reminders", input: {}, fallbackTitle: "Remind families about tomorrow's site visits" }, async (ctx) => {
    const db = agentDb(ctx, VISIT_HOST_TOOLS);
    const hours = ctx.book.get("visits.booking").reminder_hours_before;
    const due = await db.select<VisitRow>("visits", { where: { status: "scheduled", reminder_sent_at: where.isNull(), scheduled_at: where.lte(new Date(ctx.now.getTime() + hours * 3600_000).toISOString()) } });
    let drafted = 0;
    for (const v of due) {
      if (Date.parse(v.scheduled_at) <= ctx.now.getTime()) continue;
      const { lead, contact } = await load(db, v.id);
      const when = formatSlot(v.scheduled_at);
      const body = `Namaste ${contact?.full_name.split(" ")[0] ?? "there"}, a gentle reminder that we look forward to welcoming you at Wiwaha by Praman on ${when}. If anything changes, just reply here and we'll take care of it.\n\nWarmly,\nTeam Wiwaha`;
      await proposeClientMessage(ctx, { channel: contact?.phone_e164 ? "whatsapp" : "email", to: contact?.phone_e164 ?? contact?.email ?? null, subject: "See you tomorrow at Wiwaha", body, leadId: lead.id, approvalKind: VISIT_HOST_GATE.approvalKind, title: `Visit reminder for ${contact?.full_name ?? "a family"}`, summary: when });
      await db.update("visits", { id: v.id }, { reminder_sent_at: ctx.now.toISOString() });
      drafted++;
    }
    await ctx.log({ action: "visit_reminders", status: "ok", input: {}, output: { drafted } });
    return { drafted };
  });
}

/** The executive's voice note (dictated on the phone) becomes the visit recap on the lead. */
export async function recapVisit(deps: AgentDeps, visitId: string, transcript: string): Promise<RunOutcome<{ recap: string }>> {
  return runAgent(deps, VISIT_HOST, { action: "visit_recap", input: { visit_id: visitId }, fallbackTitle: "Write up a site visit" }, async (ctx) => {
    const db = agentDb(ctx, VISIT_HOST_TOOLS);
    const { visit, lead, contact } = await load(db, visitId);
    const template = `Visit with ${contact?.full_name ?? "the family"} (${formatSlot(visit.scheduled_at)}). Executive's note: ${transcript.trim()}`;
    const recap = await writeText(ctx, { policies: POLICIES, facts: { family: contact?.full_name ?? null, when: formatSlot(visit.scheduled_at), voice_note: transcript }, task: "Summarise this executive's voice note into a visit recap: what they liked, concerns, decisions, next steps. 3-5 sentences, plain text.", template, clientFacing: false, maxTokens: 400 });
    await db.update("visits", { id: visit.id }, { voice_note_transcript: transcript, recap: recap.body, recap_at: ctx.now.toISOString(), status: visit.status === "scheduled" ? "completed" : visit.status });
    if (["new", "contacted", "visit_booked"].includes(lead.status)) await db.update("leads", { id: lead.id }, { status: "visited" });
    await ctx.deps.store.createMessage({ leadId: lead.id, channel: "internal", direction: "internal", status: "sent", authorKind: "agent", agentKey: VISIT_HOST, body: `Visit recap: ${recap.body}` });
    await ctx.log({ action: "visit_recap", status: "ok", leadId: lead.id, subjectTable: "visits", subjectId: visit.id, input: { transcript }, output: { recap: recap.body }, model: recap.model, inputTokens: recap.inputTokens, outputTokens: recap.outputTokens, costUsdMicros: recap.costUsdMicros });
    return { recap: recap.body };
  });
}
