import type { Json } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { detailVariations, themesFor } from "../../domain/decor-themes";
import { maybeRequestQuote } from "../../domain/readiness";
import { where } from "../../framework/db";
import { agentDb, alertStaff, proposeClientMessage, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { openDecorQuestionnaire, onShareDecided } from "./ai-moodboards";
import { DESIGN_GATE } from "./gate";
import { DESIGN_TOOLS } from "./tools";

export const DESIGN = "design";

interface Template { id: string; area: string; title: string; function_type: string | null; description: string | null; reference_image_url: string | null; examples: { url: string; caption?: string }[] | null; palette: string[] | null; design_kind: string }
const POLICIES: readonly PolicyKey[] = ["moodboards", "decor.providers"];

/** Décor stage started: about five broad moodboards per function (round 1). */
export async function generateMoodboards(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ created: number }>> {
  return runAgent(deps, DESIGN, { action: "generate_moodboards", weddingId, input: {}, fallbackTitle: "Create décor moodboards" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const rules = ctx.book.get("moodboards");
    const [w] = await db.select<{ id: string; title: string; primary_contact_id: string | null }>("weddings", { where: { id: weddingId } });
    const functions = await db.select<{ id: string; type: string; name: string }>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }] });
    const existing = await db.select<{ function_id: string }>("moodboards", { where: { wedding_id: weddingId, round: 1 } });
    // Sample moodboards by area, uploaded by the team, come first; built-in themes fill the rest.
    const templates = await db.select<Template>("decor_templates", { where: { active: true }, order: [{ column: "sort" }] });
    let created = 0;
    for (const fn of functions) {
      if (existing.some((m) => m.function_id === fn.id)) continue;
      const fromTemplates = templates.filter((t) => !t.function_type || t.function_type === fn.type)
        .sort((a, b) => Number(!!b.function_type) - Number(!!a.function_type))
        .slice(0, rules.per_function)
        .map((t) => ({
          wedding_id: weddingId, function_id: fn.id, round: 1, theme: t.title, design_kind: t.design_kind,
          palette: t.palette?.length ? t.palette : ["#7A8F6E", "#C9A24B", "#F8F3E9"], description: [t.area, t.description].filter(Boolean).join(": "), status: "generated", template_id: t.id,
          images: [...(t.examples ?? []).map((e) => ({ kind: "photo", url: e.url, alt: e.caption ?? t.title })), ...(t.reference_image_url ? [{ kind: "photo", url: t.reference_image_url, alt: `${t.area} as it is` }] : [])],
        }));
      const themed = themesFor(fn.type, Math.max(0, rules.per_function - fromTemplates.length)).map((t) => ({
        wedding_id: weddingId, function_id: fn.id, round: 1, theme: t.name, design_kind: t.kind,
        palette: t.palette, description: t.description, status: "generated",
        images: [{ kind: "prompt", prompt: `${t.imagePrompt}, Wiwaha by Praman estate near Bengaluru`, alt: t.name }],
      }));
      const rows = [...fromTemplates, ...themed];
      // The database refuses this before the décor unlock (its payment part): never bypassed here.
      await db.insert("moodboards", rows);
      created += rows.length;
    }
    if (created) {
      await db.update("wedding_stages", { wedding_id: weddingId, key: "decor" }, { status: "awaiting_client", owner_label: "Our décor team and the Design assistant" });
      const [c] = w?.primary_contact_id ? await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
      if (c) await proposeClientMessage(ctx, { channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, weddingId, approvalKind: "client_message", title: `Moodboards ready for ${w!.title}`, body: `Namaste ${c.full_name.split(" ")[0]}, your first décor moodboards are ready in your portal: a few broad themes for each function. Shortlist the ones that feel like you, and we'll refine them into detail.\n\nWarmly,\nTeam Wiwaha` });
    }
    await ctx.log({ action: "generate_moodboards", status: "ok", weddingId, input: { functions: functions.length }, output: { created, per_function: rules.per_function } as Json, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { created };
  });
}

/** The couple shortlisted a board: refine it (round 2) and hand the shortlist to the décor lead. */
export async function onShortlisted(deps: AgentDeps, moodboardId: string): Promise<RunOutcome<{ details: number }>> {
  return runAgent(deps, DESIGN, { action: "moodboard_shortlisted", input: { moodboard_id: moodboardId }, fallbackTitle: "Refine a shortlisted moodboard" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const [m] = await db.select<{ id: string; wedding_id: string; function_id: string; round: number; theme: string; palette: string[]; description: string | null; design_kind: string; client_feedback: string | null; source: string | null }>("moodboards", { where: { id: moodboardId } });
    if (!m) throw new Error("Moodboard not found");
    const already = await db.select("moodboards", { where: { parent_id: m.id } });
    let details = 0;
    // AI boards are refined slide by slide from the couple's notes, not with prompt-only detail boards.
    if (already.length === 0 && m.round === 1 && m.source !== "ai") {
      const variations = detailVariations(m).map((v) => ({ wedding_id: m.wedding_id, function_id: m.function_id, round: 2, parent_id: m.id, theme: v.theme, palette: v.palette, design_kind: m.design_kind, description: m.client_feedback ? `${v.description} Couple's note: ${m.client_feedback}` : v.description, status: "generated", images: [{ kind: "prompt", prompt: `${v.theme}, detailed close-up styling`, alt: v.theme }] }));
      await db.insert("moodboards", variations);
      details = variations.length;
    }
    const [w] = await db.select<{ title: string; event_manager_id: string | null }>("weddings", { where: { id: m.wedding_id } });
    await alertStaff(deps, { userIds: w?.event_manager_id ? [w.event_manager_id] : undefined, role: w?.event_manager_id ? undefined : DESIGN_GATE.decorLeadRole, title: `Shortlisted: ${m.theme} (${m.design_kind})`, body: `${w?.title ?? "A couple"} shortlisted a moodboard${m.client_feedback ? `: "${m.client_feedback}"` : ""}. Finalise it when ready.`, link: `/team/weddings/${m.wedding_id}?tab=decor`, weddingId: m.wedding_id });
    await ctx.log({ action: "moodboard_shortlisted", status: "ok", weddingId: m.wedding_id, input: { moodboard_id: moodboardId }, output: { details } });
    return { details };
  });
}

/** The décor lead finalised a board: custom work goes to Prashanth; standard is done. */
export async function onFinalised(deps: AgentDeps, moodboardId: string): Promise<RunOutcome<{ approvalId: string | null }>> {
  return runAgent(deps, DESIGN, { action: "moodboard_finalised", input: { moodboard_id: moodboardId }, fallbackTitle: "Finalise a moodboard" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const [m] = await db.select<{ id: string; wedding_id: string; function_id: string; theme: string; design_kind: string; description: string | null; approval_id: string | null }>("moodboards", { where: { id: moodboardId } });
    if (!m) throw new Error("Moodboard not found");
    let approvalId: string | null = null;
    if (m.design_kind === "custom" && ctx.book.get("moodboards").custom_needs_owner_approval && !m.approval_id) {
      const [fn] = await db.select<{ name: string }>("event_functions", { where: { id: m.function_id } });
      approvalId = await requestApproval(ctx, { kind: DESIGN_GATE.customApproval, weddingId: m.wedding_id, title: `Custom décor: ${m.theme} for the ${fn?.name ?? "function"}`, summary: m.description ?? undefined, payload: { moodboard_id: m.id } });
      await db.update("moodboards", { id: m.id }, { approval_id: approvalId });
    }
    const quoteRequested = approvalId ? false : await maybeRequestQuote(db, m.wedding_id, DESIGN);
    await ctx.log({ action: "moodboard_finalised", status: approvalId ? "gated" : "ok", weddingId: m.wedding_id, input: { moodboard_id: moodboardId }, output: { approval_id: approvalId, quote_requested: quoteRequested } });
    return { approvalId };
  });
}

/** Prashanth decided on custom décor. */
export async function onCustomDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ approved: boolean }>> {
  return runAgent(deps, DESIGN, { action: "custom_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Record a custom décor decision" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const [m] = await db.select<{ id: string; wedding_id: string }>("moodboards", { where: { approval_id: approvalId } });
    if (!m) return { approved: false };
    const approved = status !== "rejected";
    await db.update("moodboards", { id: m.id }, { status: approved ? "approved" : "shortlisted" });
    if (approved) await maybeRequestQuote(db, m.wedding_id, DESIGN);
    await ctx.log({ action: "custom_decided", status: "ok", weddingId: m.wedding_id, input: { status }, output: { approved } });
    return { approved };
  });
}

export const DESIGN_FINALISED_STATUSES = where.in(["finalised", "approved"]);

/**
 * The décor stage started. With AI moodboards on, the couple first fills in
 * the décor questionnaire; otherwise the template boards are made straight away.
 */
export async function onDecorStageStarted(deps: AgentDeps, weddingId: string): Promise<RunOutcome<unknown>> {
  const rows = await deps.store.loadPolicyRows();
  const ai = rows.find((r) => r.key === "decor.ai_moodboards")?.value as { enabled?: boolean } | undefined;
  return ai?.enabled === false ? generateMoodboards(deps, weddingId) : openDecorQuestionnaire(deps, weddingId);
}

/** A decision on one of Design's approvals: custom décor, or sharing AI boards. */
export async function onDesignDecided(deps: AgentDeps, approvalId: string, status: string, kind: string | null): Promise<RunOutcome<unknown>> {
  return kind === DESIGN_GATE.shareApproval ? onShareDecided(deps, approvalId, status) : onCustomDecided(deps, approvalId, status);
}
