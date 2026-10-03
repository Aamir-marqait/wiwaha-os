import type { Json } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { agentDb, alertStaff, proposeClientMessage, requestApproval, writeText } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { REPUTATION_GATE } from "./gate";
import { REPUTATION_TOOLS } from "./tools";

export const REPUTATION = "reputation";
const POLICIES: readonly PolicyKey[] = ["honesty.commitments", "reviews.after_event", "reviews.replies", "discounts"];

interface ExternalReview { id: string; platform: string; author_name: string | null; rating: number | null; body: string | null; reply_status: string }

/** A new Google/WedMeGood review: draft a reply for approval; low scores go to Prashanth now. */
export async function onExternalReview(deps: AgentDeps, reviewId: string): Promise<RunOutcome<{ approvalId: string; low: boolean }>> {
  return runAgent(deps, REPUTATION, { action: "external_review", input: { review_id: reviewId }, fallbackTitle: "Reply to a new public review" }, async (ctx) => {
    const db = agentDb(ctx, REPUTATION_TOOLS);
    const [r] = await db.select<ExternalReview>("external_reviews", { where: { id: reviewId } });
    if (!r) throw new Error(`Review ${reviewId} not found`);
    const threshold = ctx.book.get("reviews.after_event").low_score_threshold;
    const low = r.rating !== null && r.rating <= threshold;
    const name = r.author_name?.split(" ")[0] ?? "there";
    if (low) {
      await alertStaff(deps, { role: REPUTATION_GATE.lowScoreTo, title: `Low ${r.platform} review: ${r.rating}★ from ${r.author_name ?? "a guest"}`, body: (r.body ?? "").slice(0, 300), link: "/team/sales?tab=reviews", whatsapp: true });
      await deps.store.queueHuman({ agentKey: REPUTATION, reason: "escalation", assignedRole: "owner", title: `${r.rating}★ ${r.platform} review needs your attention`, detail: r.body ?? undefined, payload: { review_id: r.id } });
    }
    const template = low
      ? `Dear ${name}, thank you for taking the time to share this. We're truly sorry your experience fell short of what we aim for, and we'd value the chance to understand what happened. Prashanth will reach out to you personally.\n\nWarmly,\nTeam Wiwaha`
      : `Dear ${name}, thank you so much for your kind words. It was a joy to be part of your celebration, and we're delighted it felt so special. We hope to welcome you back to Wiwaha soon.\n\nWarmly,\nTeam Wiwaha`;
    const text = await writeText(ctx, { policies: POLICIES, facts: { platform: r.platform, reviewer_first_name: name, rating: r.rating, review: r.body }, task: "Write the public reply to this review.", template, clientFacing: true });
    await db.update("external_reviews", { id: r.id }, { reply_draft: text.body, reply_status: "drafted" });
    const approvalId = await requestApproval(ctx, { kind: REPUTATION_GATE.approvalKind, title: `Reply to ${r.author_name ?? "a reviewer"} on ${r.platform} (${r.rating ?? "?"}★)`, summary: (r.body ?? "").slice(0, 160), payload: { review_id: r.id, body: text.body }, priority: low ? 1 : 3, flags: text.flags });
    await db.update("external_reviews", { id: r.id }, { approval_id: approvalId });
    await ctx.log({ action: "external_review", status: "gated", input: { review_id: r.id, rating: r.rating }, output: { draft: text.body, low, approval_id: approvalId } as Json, model: text.model, inputTokens: text.inputTokens, outputTokens: text.outputTokens, costUsdMicros: text.costUsdMicros, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { approvalId, low };
  });
}

/** Our own after-event review form was submitted. */
export async function onReviewSubmitted(deps: AgentDeps, reviewId: string): Promise<RunOutcome<{ low: boolean; testimonial: boolean }>> {
  return runAgent(deps, REPUTATION, { action: "review_submitted", input: { review_id: reviewId }, fallbackTitle: "Look at a couple's review" }, async (ctx) => {
    const db = agentDb(ctx, REPUTATION_TOOLS);
    const [r] = await db.select<{ id: string; wedding_id: string; contact_id: string | null; score: number | null; nps: number | null; testimonial: string | null; publish_consent: boolean; escalated_at: string | null }>("reviews", { where: { id: reviewId } });
    if (!r) throw new Error(`Review ${reviewId} not found`);
    const policy = ctx.book.get("reviews.after_event");
    const capture = ctx.book.get("reviews.replies").capture_testimonial_min_score;
    const [w] = await db.select<{ title: string }>("weddings", { where: { id: r.wedding_id } });
    const low = r.score !== null && r.score <= policy.low_score_threshold;
    if (low && !r.escalated_at) {
      // "Low scores reach Prashanth within 2 hours": we send it the moment it lands.
      await alertStaff(deps, { role: "owner", title: `Low review from ${w?.title ?? "a couple"}: ${r.score}/5`, body: (r.testimonial ?? "No comment left.").slice(0, 300), link: `/team/weddings/${r.wedding_id}`, whatsapp: true, weddingId: r.wedding_id });
      await deps.store.queueHuman({ agentKey: REPUTATION, reason: "escalation", assignedRole: "owner", weddingId: r.wedding_id, title: `${w?.title ?? "A couple"} scored us ${r.score}/5`, detail: r.testimonial ?? undefined, payload: { review_id: r.id } });
      await db.update("reviews", { id: r.id }, { escalated_at: ctx.now.toISOString() });
    }
    const testimonial = !low && r.score !== null && r.score >= capture && !!r.testimonial && r.publish_consent;
    if (testimonial) await db.update("reviews", { id: r.id }, { testimonial_captured_at: ctx.now.toISOString() });
    if (!low && r.score !== null && r.score >= capture && r.contact_id) {
      const [c] = await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: r.contact_id } });
      if (c) {
        await proposeClientMessage(ctx, {
          channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, weddingId: r.wedding_id, approvalKind: "client_message",
          title: `Ask ${c.full_name.split(" ")[0]} to share their review publicly`,
          body: `Dear ${c.full_name.split(" ")[0]}, thank you so much for your lovely words about your celebration at Wiwaha. If you have a moment, sharing them on Google or WedMeGood would mean a great deal to us and help other couples find us.\n\nWarmly,\nTeam Wiwaha`,
        });
      }
    }
    await ctx.log({ action: "review_submitted", status: low ? "escalated" : "ok", weddingId: r.wedding_id, input: { review_id: r.id, score: r.score }, output: { low, testimonial } });
    return { low, testimonial };
  });
}

/** Prashanth approved (or edited/rejected) a reply. Posting is manual until a listings API is connected. */
export async function onReplyDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ updated: number }>> {
  return runAgent(deps, REPUTATION, { action: "reply_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Post an approved review reply" }, async (ctx) => {
    const db = agentDb(ctx, REPUTATION_TOOLS);
    const [a] = await db.select<{ payload: { body?: string } | null; edited_payload: { body?: string } | null }>("approvals", { where: { id: approvalId } });
    const finalBody = a?.edited_payload?.body ?? a?.payload?.body ?? null;
    const rows = await db.select<{ id: string }>("external_reviews", { where: { approval_id: approvalId } });
    for (const r of rows) {
      await db.update("external_reviews", { id: r.id }, { reply_status: status === "rejected" ? "rejected" : "approved", ...(finalBody && status !== "rejected" ? { reply_draft: finalBody } : {}) });
    }
    await ctx.log({ action: "reply_decided", status: "ok", input: { approval_id: approvalId, status }, output: { updated: rows.length } });
    return { updated: rows.length };
  });
}
