import type { Json } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { z } from "zod";
import {
  areasForFunction, decorAnswersComplete, elementFor, paletteHex, parseDecorAnswers, slidePrompt,
  summariseDecorAnswers, summariseFunctionAnswers, templateCaption, type AreaInfo, type DecorAnswers,
} from "../../domain/decor-brief";
import { where } from "../../framework/db";
import { checkClientMessage } from "../../framework/guardrails";
import { agentDb, alertStaff, askJson, proposeClientMessage, requestApproval } from "../../framework/kit";
import { decideDelivery, runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { DESIGN_GATE } from "./gate";
import { DESIGN_TOOLS } from "./tools";

/**
 * AI moodboards (D40): the couple's décor questionnaire + our plain photo of
 * each area + our area-wise templates → one board per function, an AI-dressed
 * picture per area. This file decides WHAT to make; the web app's media
 * worker makes the pictures (fal) and calls onMoodboardRendered when done.
 */

const DESIGN = "design";
const POLICIES: readonly PolicyKey[] = ["moodboards", "decor.ai_moodboards", "decor.providers"];

interface Fn { id: string; type: string; name: string; date: string; space_id: string | null; guest_count: number | null }
interface Photo { id: string; url: string; venue_area_id: string; is_primary: boolean; angle: string | null; created_at: string }
interface Template { id: string; area: string; title: string; function_type: string | null; description: string | null; examples: { url: string }[] | null; reference_image_url: string | null; venue_area_id: string | null; design_kind: string; active: boolean }

/** Our template photos that fit an area (linked to it, or named like it), function-specific first. */
export function templatesForArea(templates: readonly Template[], area: AreaInfo, fnType: string, element: string): Template[] {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const areaWords = new Set([...words(area.name), ...words(element), area.kind]);
  const matches = templates.filter((t) => t.active && (!t.function_type || t.function_type === fnType) && (
    t.venue_area_id === area.id || (!t.venue_area_id && words(t.area).some((w) => areaWords.has(w) || [...areaWords].some((a) => a.startsWith(w) || w.startsWith(a))))
  ));
  return matches.sort((a, b) => Number(!!b.function_type) - Number(!!a.function_type) || Number(b.venue_area_id === area.id) - Number(a.venue_area_id === area.id));
}

const planSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().min(10).max(600),
  slides: z.array(z.object({
    area_id: z.string(),
    element: z.string().min(2).max(60),
    caption: z.string().min(3).max(160),
    direction: z.string().max(600).default(""),
  })).min(1),
});
type BoardPlan = z.infer<typeof planSchema>;

function fallbackPlan(fn: Fn, areas: AreaInfo[], answers: DecorAnswers): BoardPlan {
  const style = answers.style ? answers.style.replace(/_/g, " ") : "classic";
  return {
    title: `${style[0]!.toUpperCase()}${style.slice(1)} ${fn.name.toLowerCase()}`,
    description: `${fn.name} across ${areas.map((a) => a.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")}, dressed in the colours and flowers you chose.`,
    slides: areas.map((a) => {
      const element = elementFor(a, fn.type);
      return { area_id: a.id, element, caption: templateCaption(element, answers), direction: "" };
    }),
  };
}

async function planBoard(ctx: RunContext, fn: Fn, areas: AreaInfo[], answers: DecorAnswers, templates: Template[]): Promise<{ plan: BoardPlan; source: "llm" | "template"; tokens: { input: number; output: number; cost: number } }> {
  const fallback = () => fallbackPlan(fn, areas, answers);
  const asked = await askJson(ctx, {
    policies: POLICIES,
    facts: {
      function: { name: fn.name, type: fn.type, date: fn.date, guests: fn.guest_count },
      areas: areas.map((a) => ({ area_id: a.id, name: a.name, kind: a.kind, description: a.description, usual_element: elementFor(a, fn.type) })),
      couple_answers: summariseDecorAnswers(answers),
      this_function: summariseFunctionAnswers(answers.functions[fn.id]),
      our_templates_for_these_areas: templates.slice(0, 12).map((t) => ({ area: t.area, title: t.title, description: t.description })),
    },
    task: [
      `Plan the AI moodboard for the ${fn.name}. One slide per area, in the order given, using each area_id exactly once.`,
      "For each slide: `element` (what the area becomes, e.g. Mandap, Entrance décor, Stage backdrop, Guest seating), `caption` (one warm line the couple reads under the picture, e.g. 'Brass urlis and tuberose either side of the carved door'), and `direction` (two or three sentences for the image model: what to place where in THIS space, scale, materials).",
      "Also a board `title` (2 to 5 words, e.g. 'Brass and mallige') and a two-sentence `description` of the mood.",
      'Return JSON: {"title": string, "description": string, "slides": [{"area_id": string, "element": string, "caption": string, "direction": string}]}',
    ].join("\n"),
    parse: (v) => {
      const plan = planSchema.parse(v);
      const ids = new Set(areas.map((a) => a.id));
      const slides = plan.slides.filter((s) => ids.has(s.area_id));
      const seen = new Set<string>();
      const unique = slides.filter((s) => (seen.has(s.area_id) ? false : (seen.add(s.area_id), true)));
      // Any area the model skipped still gets its slide.
      const fb = fallback();
      for (const a of areas) if (!seen.has(a.id)) unique.push(fb.slides.find((s) => s.area_id === a.id)!);
      // The couple reads the title, description and captions: no prices, discounts or promises.
      const safe = (t: string) => checkClientMessage(t, { book: ctx.book, decorUnlocked: true }).ok;
      return {
        title: safe(plan.title) ? plan.title : fb.title,
        description: safe(plan.description) ? plan.description : fb.description,
        slides: areas.map((a) => {
          const s = unique.find((x) => x.area_id === a.id)!;
          const f = fb.slides.find((x) => x.area_id === a.id)!;
          return { ...s, element: safe(s.element) ? s.element : f.element, caption: safe(s.caption) ? s.caption : f.caption };
        }),
      };
    },
    fallback,
    maxTokens: 2500,
  });
  return { plan: asked.value, source: asked.source, tokens: { input: asked.inputTokens ?? 0, output: asked.outputTokens ?? 0, cost: asked.costUsdMicros ?? 0 } };
}

/**
 * Décor opened (the couple pressed Start, or staff did): open the
 * questionnaire and ask the couple to fill it in.
 */
export async function openDecorQuestionnaire(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ opened: boolean }>> {
  return runAgent(deps, DESIGN, { action: "open_decor_questionnaire", weddingId, input: {}, fallbackTitle: "Send the couple the décor questionnaire" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const [existing] = await db.select<{ wedding_id: string; status: string }>("decor_briefs", { where: { wedding_id: weddingId } });
    if (existing && existing.status !== "open") return { opened: false };
    if (!existing) await db.insert("decor_briefs", { wedding_id: weddingId, status: "open", answers: {}, sent_at: ctx.now.toISOString() });
    else await db.update("decor_briefs", { wedding_id: weddingId }, { sent_at: ctx.now.toISOString() });
    await db.update("wedding_stages", { wedding_id: weddingId, key: "decor" }, { status: "awaiting_client", owner_label: "You, then our décor team" });
    const [w] = await db.select<{ title: string; primary_contact_id: string | null }>("weddings", { where: { id: weddingId } });
    const [c] = w?.primary_contact_id ? await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
    if (c) {
      await proposeClientMessage(ctx, {
        channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, weddingId, approvalKind: "client_message",
        title: `Décor questionnaire for ${w!.title}`,
        body: `Namaste ${c.full_name.split(" ")[0]}, décor planning is open! There's a short questionnaire in your portal under Décor: your traditions, colours, flowers and the touches you love for each function. Once you send it, we'll prepare a moodboard for every function, showing each space at Wiwaha dressed the way you described.\n\nWarmly,\nTeam Wiwaha`,
      });
    }
    await ctx.log({ action: "open_decor_questionnaire", status: "ok", weddingId, output: { messaged: !!c } });
    return { opened: true };
  });
}

/**
 * The couple sent the questionnaire (or staff pressed "Make moodboards"):
 * plan one AI board per function and queue its slides for the media worker.
 */
export async function prepareAiMoodboards(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ boards: number; slides: number; aiSlides: number }>> {
  return runAgent(deps, DESIGN, { action: "prepare_ai_moodboards", weddingId, input: {}, fallbackTitle: "Make the couple's AI moodboards" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const rules = ctx.book.get("decor.ai_moodboards");
    const perFunction = Math.min(rules.areas_per_function_max, ctx.book.get("moodboards").per_function);
    const [brief] = await db.select<{ answers: unknown; status: string }>("decor_briefs", { where: { wedding_id: weddingId } });
    const answers = parseDecorAnswers(brief?.answers ?? {});
    const functions = await db.select<Fn>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }, { column: "start_time" }] });
    const areas = await db.select<AreaInfo>("venue_areas", { where: { active: true }, order: [{ column: "sort" }] });
    const photos = await db.select<Photo>("media_assets", { where: { look: "plain", kind: "image", status: "ready", venue_area_id: where.notNull() } });
    const templates = await db.select<Template>("decor_templates", { where: { active: true }, order: [{ column: "sort" }] });
    const existing = await db.select<{ function_id: string }>("moodboards", { where: { wedding_id: weddingId, source: "ai", round: 1 } });

    let boards = 0, slides = 0, aiSlides = 0, llm = 0;
    let inputTokens = 0, outputTokens = 0, cost = 0;
    for (const fn of functions) {
      if (existing.some((m) => m.function_id === fn.id)) continue;
      const chosen = areasForFunction(fn, answers.functions[fn.id]?.areas ?? [], areas, perFunction);
      if (chosen.length === 0) continue;
      const refsByArea = new Map(chosen.map((a) => [a.id, templatesForArea(templates, a, fn.type, elementFor(a, fn.type))]));
      const { plan, source, tokens } = await planBoard(ctx, fn, chosen, answers, [...new Set([...refsByArea.values()].flat())]);
      if (source === "llm") llm++;
      inputTokens += tokens.input; outputTokens += tokens.output; cost += tokens.cost;
      // Standard when every area has one of our own templates behind it; otherwise it's bespoke.
      const designKind = chosen.every((a) => (refsByArea.get(a.id) ?? []).length > 0) ? "standard" : "custom";
      // The database refuses this before the décor unlock (its payment part): never bypassed here.
      const [board] = await db.insert<{ id: string }>("moodboards", {
        wedding_id: weddingId, function_id: fn.id, round: 1, theme: plan.title, design_kind: designKind,
        palette: paletteHex(answers), description: plan.description, status: "generated", source: "ai", shared_at: null, images: [],
      });
      boards++;
      const rows = plan.slides.map((s, i) => {
        const area = chosen.find((a) => a.id === s.area_id)!;
        const areaPhotos = photos.filter((p) => p.venue_area_id === area.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at));
        const base = areaPhotos[0] ?? null;
        const refs = (refsByArea.get(area.id) ?? []).flatMap((t) => [...(t.examples ?? []).map((e) => e.url), ...(t.reference_image_url ? [t.reference_image_url] : [])]).filter(Boolean).slice(0, 2);
        const ai = !!base || !rules.plain_photo_required;
        if (ai && base) aiSlides++;
        return {
          moodboard_id: board!.id, wedding_id: weddingId, function_id: fn.id, venue_area_id: area.id, area_name: area.name,
          base_asset_id: base?.id ?? null, base_url: base?.url ?? null, element: s.element, caption: s.caption,
          prompt: slidePrompt({ areaName: area.name, areaDescription: area.description, fnType: fn.type, element: s.element, direction: s.direction, answers, fn: answers.functions[fn.id], hasReferences: refs.length > 0 }),
          reference_urls: refs, engine: base ? "ai" : "reference", status: base || refs.length ? "queued" : "failed",
          error: base || refs.length ? null : "No plain photo of this area yet: add one in Décor → Venue areas, then redo this slide.",
          redo_count: 0, sort: (i + 1) * 10,
        };
      });
      await db.insert("moodboard_slides", rows);
      slides += rows.length;
    }
    if (boards) {
      await db.update("decor_briefs", { wedding_id: weddingId }, { status: "generating" });
      await db.update("wedding_stages", { wedding_id: weddingId, key: "decor" }, { status: "in_progress", owner_label: "Our décor team and the Design assistant" });
    }
    const complete = decorAnswersComplete(answers);
    await ctx.log({
      action: "prepare_ai_moodboards", status: "ok", weddingId,
      input: { functions: functions.length, answers_complete: complete.ok, missing: complete.missing } as Json,
      output: { boards, slides, ai_slides: aiSlides, planned_by_model: llm } as Json,
      model: llm ? ctx.agent.model : null, inputTokens: inputTokens || null, outputTokens: outputTokens || null, costUsdMicros: cost || null,
      policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES),
    });
    return { boards, slides, aiSlides };
  });
}

/**
 * The media worker finished a board's last slide. Share it with the couple, or,
 * in draft mode, ask the décor team to look first (one approval per wedding batch).
 */
export async function onMoodboardRendered(deps: AgentDeps, moodboardId: string): Promise<RunOutcome<{ shared: number; approvalId: string | null }>> {
  return runAgent(deps, DESIGN, { action: "moodboard_rendered", input: { moodboard_id: moodboardId }, fallbackTitle: "Review the AI moodboards and share them with the couple" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const [m] = await db.select<{ id: string; wedding_id: string; shared_at: string | null; approval_id: string | null }>("moodboards", { where: { id: moodboardId } });
    if (!m) throw new Error("Moodboard not found");
    const weddingBoards = await db.select<{ id: string; function_id: string; shared_at: string | null; approval_id: string | null; theme: string }>("moodboards", { where: { wedding_id: m.wedding_id, source: "ai", shared_at: where.isNull() } });
    const ids = weddingBoards.map((b) => b.id);
    if (ids.length === 0) return { shared: 0, approvalId: null };
    const allSlides = await db.select<{ moodboard_id: string; status: string; element: string; result_url: string | null; edited_url: string | null; base_url: string | null; area_name: string; caption: string | null }>("moodboard_slides", { where: { moodboard_id: where.in(ids) }, order: [{ column: "sort" }] });
    // Refresh this board's pictures for the older portal views.
    for (const b of weddingBoards) {
      const mine = allSlides.filter((s) => s.moodboard_id === b.id && s.status === "ready");
      await db.update("moodboards", { id: b.id }, { images: mine.map((s) => ({ kind: "photo", url: s.edited_url ?? s.result_url ?? s.base_url, alt: `${s.element}, ${s.area_name}`, base_url: s.base_url, caption: s.caption })) as Json });
    }
    if (allSlides.some((s) => s.status === "queued" || s.status === "rendering")) return { shared: 0, approvalId: null };
    await db.update("decor_briefs", { wedding_id: m.wedding_id }, { status: "ready", generated_at: ctx.now.toISOString() });
    const [w] = await db.select<{ title: string; event_manager_id: string | null }>("weddings", { where: { id: m.wedding_id } });
    const ready = allSlides.filter((s) => s.status === "ready").length;
    const failed = allSlides.length - ready;
    // Pictures that failed always need a person to look first, whatever the dial says.
    const delivery = failed ? "approval" : decideDelivery(ctx.agent, []);
    if (delivery === "approval") {
      if (weddingBoards.some((b) => b.approval_id)) return { shared: 0, approvalId: weddingBoards.find((b) => b.approval_id)!.approval_id };
      const approvalId = await requestApproval(ctx, {
        kind: DESIGN_GATE.shareApproval, weddingId: m.wedding_id, priority: 2,
        title: `AI moodboards ready for ${w?.title ?? "a wedding"}: review before the couple sees them`,
        summary: `${weddingBoards.length} board${weddingBoards.length === 1 ? "" : "s"}, ${ready} pictures${failed ? `, ${failed} need a photo or a redo` : ""}. Open the Wedding Room's Décor tab to look, edit or redo slides, then approve to share.`,
        payload: { action: "share_ai_moodboards", moodboard_ids: ids, link: `/team/weddings/${m.wedding_id}?tab=decor` },
      });
      for (const id of ids) await db.update("moodboards", { id }, { approval_id: approvalId });
      await alertStaff(deps, { userIds: w?.event_manager_id ? [w.event_manager_id] : undefined, role: w?.event_manager_id ? undefined : DESIGN_GATE.decorLeadRole, title: `AI moodboards ready: ${w?.title ?? ""}`, body: "Look them over and share them with the couple.", link: `/team/weddings/${m.wedding_id}?tab=decor`, weddingId: m.wedding_id, agentKey: DESIGN });
      await ctx.log({ action: "moodboard_rendered", status: "gated", weddingId: m.wedding_id, approvalId, output: { boards: ids.length, ready, failed } });
      return { shared: 0, approvalId };
    }
    const shared = await shareBoards(ctx, m.wedding_id, ids);
    await ctx.log({ action: "moodboard_rendered", status: "ok", weddingId: m.wedding_id, output: { shared, ready, failed } });
    return { shared, approvalId: null };
  });
}

async function shareBoards(ctx: RunContext, weddingId: string, ids: string[]): Promise<number> {
  const db = agentDb(ctx, DESIGN_TOOLS);
  const boards = await db.update<{ id: string }>("moodboards", { id: where.in(ids), shared_at: where.isNull() }, { shared_at: ctx.now.toISOString() });
  if (boards.length === 0) return 0;
  await db.update("wedding_stages", { wedding_id: weddingId, key: "decor" }, { status: "awaiting_client", owner_label: "You: shortlist what feels like you" });
  const [w] = await db.select<{ title: string; primary_contact_id: string | null }>("weddings", { where: { id: weddingId } });
  const [c] = w?.primary_contact_id ? await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
  if (c) {
    await proposeClientMessage(ctx, {
      channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, weddingId, approvalKind: "client_message",
      title: `Moodboards shared with ${w!.title}`,
      body: `Namaste ${c.full_name.split(" ")[0]}, your moodboards are ready in the portal under Décor: each space at Wiwaha as it is, next to how it could look for your functions. Shortlist what feels like you, or tell us on any picture what you'd change, and we'll refine it.\n\nWarmly,\nTeam Wiwaha`,
    });
  }
  return boards.length;
}

/** The décor team decided the "share AI moodboards" approval. */
export async function onShareDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ shared: number }>> {
  return runAgent(deps, DESIGN, { action: "share_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Share the AI moodboards with the couple" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const boards = await db.select<{ id: string; wedding_id: string }>("moodboards", { where: { approval_id: approvalId, source: "ai" } });
    if (boards.length === 0) return { shared: 0 };
    if (status === "rejected") {
      await db.update("moodboards", { approval_id: approvalId }, { approval_id: null });
      await ctx.log({ action: "share_decided", status: "ok", weddingId: boards[0]!.wedding_id, output: { shared: 0, held_back: boards.length } });
      return { shared: 0 };
    }
    const shared = await shareBoards(ctx, boards[0]!.wedding_id, boards.map((b) => b.id));
    await ctx.log({ action: "share_decided", status: "ok", weddingId: boards[0]!.wedding_id, output: { shared } });
    return { shared };
  });
}

/** The couple asked for a change on one slide: redo it with their words, within the redo allowance. */
export async function onSlideFeedback(deps: AgentDeps, slideId: string): Promise<RunOutcome<{ requeued: boolean }>> {
  return runAgent(deps, DESIGN, { action: "slide_feedback", input: { slide_id: slideId }, fallbackTitle: "Redo a moodboard slide the couple commented on" }, async (ctx) => {
    const db = agentDb(ctx, DESIGN_TOOLS);
    const [s] = await db.select<{ id: string; wedding_id: string; moodboard_id: string; prompt: string | null; client_note: string | null; redo_count: number; engine: string; element: string; area_name: string }>("moodboard_slides", { where: { id: slideId } });
    if (!s) throw new Error("Slide not found");
    const limit = ctx.book.get("decor.ai_moodboards").redos_per_slide;
    const redos = Number(s.redo_count ?? 0);
    const [w] = await db.select<{ title: string; event_manager_id: string | null }>("weddings", { where: { id: s.wedding_id } });
    const note = (s.client_note ?? "").trim();
    const canRedo = s.engine === "ai" && !!s.prompt && redos < limit && note.length > 0;
    if (canRedo) {
      const base = s.prompt!.split(" The couple asked for these changes:")[0]!;
      await db.update("moodboard_slides", { id: s.id }, { status: "queued", prompt: `${base} The couple asked for these changes: "${note.replace(/"/g, "'")}". Apply them while keeping the place exactly as it is.`, redo_count: redos + 1, error: null });
    }
    await alertStaff(deps, {
      userIds: w?.event_manager_id ? [w.event_manager_id] : undefined, role: w?.event_manager_id ? undefined : DESIGN_GATE.decorLeadRole,
      title: `${w?.title ?? "A couple"} commented on ${s.element} (${s.area_name})`,
      body: `"${note}"${canRedo ? " · Redoing the picture now." : redos >= limit ? " · Redo allowance used: edit and upload a version yourself." : ""}`,
      link: `/team/weddings/${s.wedding_id}?tab=decor`, weddingId: s.wedding_id, agentKey: DESIGN,
    });
    await ctx.log({ action: "slide_feedback", status: "ok", weddingId: s.wedding_id, output: { requeued: canRedo, redo_count: redos + (canRedo ? 1 : 0) } });
    return { requeued: canRedo };
  });
}
