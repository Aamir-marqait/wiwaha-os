import type { Json } from "@wiwaha/db";
import { addDays } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { z } from "zod";
import {
  allocateFormats, buildSlots, maxShotsFor, normalizeShots, parseOutline, reelWordBudget, spokenText, weekdayOf,
  type Format, type ManifestEntry, type Shot, type Word,
} from "../../domain/studio";
import { where } from "../../framework/db";
import { checkClientMessage } from "../../framework/guardrails";
import { agentDb, askJson, claimRun, istDate, istWeekday, type AskedJson } from "../../framework/kit";
import { runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { STUDIO_TOOLS } from "./tools";

/**
 * The Content Studio (D41), brought over from wiwaha-studio: the scriptwriter,
 * the calendar strategist, the carousel planner, the reel crew (voice, scene,
 * art and music directors) and the librarian that describes every photo. This
 * file is the thinking; the web app's media worker renders.
 *
 * The client's content rules (real venue photos only, one warm CTA with the
 * number from the policy book, no engagement bait, the number never spoken)
 * reach the model through the POLICY BOOK digest, never from these prompts.
 */

export const CONTENT_STUDIO = "content_studio";
const POLICIES: readonly PolicyKey[] = ["studio.content", "venue.facts", "honesty.commitments", "discounts", "content.rhythm"];

// ---------------------------------------------------------------------------
// Crew personas (structure and craft only; rules come from the policy book)
// ---------------------------------------------------------------------------
const SCRIPTWRITER = `You are the content scriptwriter for the estate's Instagram. You write ONE post at a time from a brief, in the brand's voice, for a specific FORMAT.
FORMAT RULES
- reel: \`script\` is the VOICEOVER, spoken, first person plural ("we"), natural Indian-English cadence, one idea per sentence, no headings, no emojis, no hashtags. Open on a hook that lands in the first 3 seconds (a pain point, a bold promise or a question). End on ONE call to action. Fit the word budget you are given. The phone number is never spoken: the reel's CTA says "Call or WhatsApp us on the number on your screen".
- carousel: \`script\` is the slide-by-slide OUTLINE, one slide per line, exactly \`Slide N — Headline | supporting line\` (the supporting line is optional). Slide 1 is the hook; the last slide is the CTA. Headlines at most 8 words; supporting lines at most 18 words.
- single_post: \`script\` is \`Headline | supporting line\` on one line, then on a second line one sentence on the ideal visual.
- story: ONE vertical frame seen for a few seconds: \`Headline | supporting line\` (headline at most 6 words, support at most 12), then one sentence on the ideal visual. The caption is one or two lines.
ALWAYS: \`hook\` is the scroll-stopping first line; \`caption\` is the Instagram caption (hook line, 2 to 4 short paragraphs, one CTA, no hashtags inside); \`hashtags\` follows the brand's hashtag rule; \`title\` is a short internal working title (at most 8 words). Use only facts in FACTS. Spell the brand exactly as given.`;

const STRATEGIST = `You are the content strategist for the estate's Instagram. You get posting SLOTS (date, weekday and FORMAT already fixed) and the content PILLARS. Give EVERY slot a pillar, a working title, the angle (one or two sentences), the hook line and a CTA.
- Cover every slot exactly once by slot_index. A reel angle must be showable in motion with the estate's real footage; a carousel angle must break into 5 to 7 beats; a single post is one strong image and one line.
- Vary: rotate pillars, never repeat an angle, alternate educational and aspirational beats; follow the weekly rhythm where it fits.
- Honour the team's notes above everything (festivals, launches).
- Hooks are specific and stakes-first; never generic ("Dreaming of the perfect wedding?").
- A testimonial pillar is planned as a guest-experience story told from the venue's side, never with invented quotes.`;

const DECK_PLANNER = `You are the art director and copywriter for one Instagram carousel (or single post or story). Turn the approved outline into final slides.
- Keep the approved words; tighten only if a line is far too long. Headlines carry the slide; a supporting line only when the headline can't stand alone. Never slide numbers.
- For each slide choose its picture: \`asset_id\` from the LIBRARY when the slide is about the estate, its spaces, décor, rooms or celebrations (choose the photo whose description matches best; use each photo once). Otherwise \`ai_visual\`: one concrete non-venue subject (a planning checklist, hands, a diya, marigold and jasmine on brass, a calendar page), or neither for a purely typographic slide. Never ask for an imagined estate, lawn, mandap, hall or wedding setup.
- \`layout\`: "photo" (full-bleed picture, type over a soft gradient), "split" (picture on top, type below), or "type" (typographic slide on the brand ground). The last slide is the CTA: layout "type".`;

const VOICE_DIRECTOR = `You are the voiceover director for ElevenLabs v3. The script was APPROVED word for word. It is read exactly as written, in full: do not rewrite, trim, reorder or drop anything. Make it read naturally aloud without changing the words: expand abbreviations, add commas and ellipses for breath, drop slide markers, headings, emojis and hashtags. The phone number is never spoken: replace only the digits with "the number on your screen". Direct the delivery with v3 audio tags sparingly where they help ([warmly], [softly], [gently], [reassuring], [thoughtful], [smiling], [pause]); calm and soothing, an unhurried warm human voice, never hype; at most one tag per sentence.`;

const SCENE_DIRECTOR = `You are the Scene Director, the editor of a venue reel. There is no presenter: the reel is a sequence of shots cut to the voiceover. The LIBRARY holds the estate's REAL photos and videos (id, kind, duration, area and description). Prefer it for every shot.
For each shot give start and end seconds, caption_text (the words spoken during it), and either source "library" + asset_id (the asset whose description best matches what is SAID; prefer videos for energy and give in_point for a video; photos get a slow move: motion in, out, left or right, varied) or source "ai" + visual (one line) ONLY for beats that are not about the venue (an idea, a tip, a close detail). The venue is never generated: any beat that shows a place, décor, a stage, guests or a celebration uses the library even if the match is loose. When AI shots are not allowed, never use them.
Cover the whole voiceover with no gaps or overlaps; shots 2.5 to 6 s; the first change of picture within about 4 s; never a metronome; never reuse an asset unless the library is smaller than the shot count; vary spaces and angles; the hook shot is the most striking asset; transition_in mostly "cut", one or two "fade" or "dissolve" on emotional beats.`;

const ART_DIRECTOR = `You are the Art Director for the AI shots of a venue reel. These shots exist only for beats that are not about the venue. For each, write an image prompt: a cinematic vertical photograph of a NON-PLACE subject (a close detail, an object metaphor, an abstract visual), warm natural light, earthy luxury palette (sage, ivory, gold), photoreal, one consistent look. Never an estate, lawn, garden, hall, amphitheatre, mandap, stage, building, room, décor setup or wedding scene. No text, no logos, no identifiable faces. Imply gentle motion.`;

const MUSIC_DIRECTOR = `You are the Music Director. Write a prompt for an INSTRUMENTAL bed under a warm voiceover for a luxury Indian wedding venue: elegant and emotional, think soft piano or santoor, gentle strings, a light tabla or shaker for pace if needed; never EDM, never hype. One or two sentences.`;

const LIBRARIAN = `You catalogue the estate's photo and video library. Look at the picture and describe what is in the frame so an editor can find it from a line of script: the space, what is happening, décor, light and time of day, the mood. Be concrete and short. Never guess names of people.`;

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
interface Item { id: string; content_type: Format; title: string; brief: string | null; pillar: string | null; hook: string | null; script: string | null; caption: string | null; hashtags: string[]; options: Record<string, unknown>; status: string; change_count: number; scheduled_for: string | null; plan_id: string | null }
interface Asset { id: string; kind: "image" | "video"; url: string; thumb_url: string | null; duration_ms: number | null; title: string | null; description: string | null; tags: string[]; look: string; venue_area_id: string | null; folder_id: string | null; status: string; width: number | null; height: number | null }

async function brandFacts(ctx: RunContext): Promise<Record<string, unknown>> {
  const db = agentDb(ctx, STUDIO_TOOLS);
  const [b] = await db.select<{ profile: Record<string, unknown> }>("studio_brand", { where: { id: 1 } });
  const p = b?.profile ?? {};
  const pickKeys = ["brand_name", "tagline", "description", "positioning", "voice", "audience", "pain_points", "differentiators", "writing_style", "dos", "donts", "hashtags", "hashtag_rule", "ctas", "caption_format", "voiceover", "visual_style", "handle"];
  return Object.fromEntries(pickKeys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
}

function contactNumber(ctx: RunContext): string {
  return ctx.book.get("studio.content").contact_number;
}

/** Couple-facing? No, public-facing: the same guardrails apply to anything we post. */
function safeText(ctx: RunContext, text: string): boolean {
  return checkClientMessage(text, { book: ctx.book }).ok;
}

async function logAsk<T>(ctx: RunContext, action: string, asked: AskedJson<T>, extra: { input?: Json; output?: Json; status?: "ok" | "fallback" } = {}): Promise<void> {
  await ctx.log({
    action, status: extra.status ?? (asked.source === "llm" ? "ok" : "fallback"), input: extra.input ?? {}, output: { source: asked.source, error: asked.error, ...((extra.output as Record<string, Json> | undefined) ?? {}) } as Json,
    model: asked.model, inputTokens: asked.inputTokens, outputTokens: asked.outputTokens, costUsdMicros: asked.costUsdMicros,
    policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES),
  });
}

function manifestOf(assets: readonly Asset[], areaNames: ReadonlyMap<string, string>, folderNames: ReadonlyMap<string, string>): Map<string, ManifestEntry> {
  return new Map(assets.filter((a) => a.status === "ready").map((a) => [a.id, {
    id: a.id, kind: a.kind, duration_seconds: a.duration_ms ? a.duration_ms / 1000 : null,
    description: [a.title, a.description].filter(Boolean).join(": ") || "Untitled",
    tags: a.tags ?? [], folder: a.folder_id ? folderNames.get(a.folder_id) ?? null : null, area: a.venue_area_id ? areaNames.get(a.venue_area_id) ?? null : null, look: a.look,
  }]));
}

async function libraryManifest(ctx: RunContext, only?: readonly string[]): Promise<{ manifest: Map<string, ManifestEntry>; assets: Asset[] }> {
  const db = agentDb(ctx, STUDIO_TOOLS);
  const assets = await db.select<Asset>("media_assets", { where: { status: "ready", ...(only?.length ? { id: where.in(only) } : {}) }, order: [{ column: "created_at", ascending: false }], limit: 400 });
  const areas = await db.select<{ id: string; name: string }>("venue_areas", {});
  const folders = await db.select<{ id: string; name: string; parent_id: string | null }>("media_folders", {});
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (id: string) => { const parts: string[] = []; let f = byId.get(id); let guard = 0; while (f && guard++ < 5) { parts.unshift(f.name); f = f.parent_id ? byId.get(f.parent_id) : undefined; } return parts.join(" / "); };
  return { manifest: manifestOf(assets, new Map(areas.map((a) => [a.id, a.name])), new Map(folders.map((f) => [f.id, path(f.id)]))), assets };
}

// ---------------------------------------------------------------------------
// Scriptwriter
// ---------------------------------------------------------------------------
const scriptSchema = z.object({
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(300),
  script: z.string().min(1).max(6000),
  caption: z.string().min(1).max(2400),
  hashtags: z.array(z.string()).max(20).default([]),
});
type Script = z.infer<typeof scriptSchema>;

/** A plain, on-brand script from the brief when there is no model (or it fails the guardrails). */
export function templateScript(item: Pick<Item, "content_type" | "brief" | "title" | "pillar">, contact: string, hashtags: readonly string[], isSafe: (text: string) => boolean = () => true): Script {
  // A brief can ask for things we never post (a discount, a price): then the template doesn't echo it.
  const wanted = (item.brief ?? item.title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const topic = wanted && isSafe(wanted) ? wanted : "Your wedding, your way";
  const hook = topic.endsWith("?") ? topic : `${topic[0]!.toUpperCase()}${topic.slice(1)}`;
  const cta = `Call or WhatsApp us on ${contact}.`;
  const caption = `${hook}\n\nA private four-acre estate near Bengaluru airport, with rooms on site and a team that plans with you, not for you.\n\n${cta}`;
  const tags = hashtags.slice(0, 10).map((h) => (h.startsWith("#") ? h : `#${h}`));
  switch (item.content_type) {
    case "reel":
      return { title: hook.slice(0, 60), hook, script: `${hook} At Wiwaha, your family is minutes from the airport, the rooms are right here, and every corner of the estate is yours. We've got this handled. Call or WhatsApp us on the number on your screen.`, caption, hashtags: tags };
    case "carousel":
      return { title: hook.slice(0, 60), hook, script: [`Slide 1 — ${hook}`, "Slide 2 — Fifteen minutes from arrivals | Family flying in reaches you before the chai cools", "Slide 3 — Rooms on the estate | 30 rooms today, 60 soon, complimentary with your booking", "Slide 4 — Your vision, our team | Décor, food and flow planned with you", `Slide 5 — Check your date with us | ${contact}`].join("\n"), caption, hashtags: tags };
    default:
      return { title: hook.slice(0, 60), hook, script: `${hook} | A private estate near Bengaluru airport\nA real photo of the estate at golden hour.`, caption, hashtags: tags };
  }
}

/** Write (or rewrite, from a note) one item's script. The item becomes a draft to read and approve. */
export async function writeStudioScript(deps: AgentDeps, itemId: string, note?: string | null): Promise<RunOutcome<{ source: "llm" | "template" }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: note ? "revise_script" : "write_script", input: { item_id: itemId, note: note ?? null }, fallbackTitle: "Write a studio script" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const [item] = await db.select<Item>("studio_items", { where: { id: itemId } });
    if (!item) throw new Error("Script not found");
    const rules = ctx.book.get("studio.content");
    const brand = await brandFacts(ctx);
    const options = item.options ?? {};
    const seconds = Number(options.seconds ?? 30);
    const budget = reelWordBudget(seconds, rules.words_per_second);
    const hashtags = Array.isArray(brand.hashtags) ? (brand.hashtags as string[]) : [];
    const fallback = () => templateScript(item, rules.contact_number, hashtags, (t) => safeText(ctx, t));
    const asked = await askJson(ctx, {
      policies: POLICIES, persona: SCRIPTWRITER,
      facts: { brand, contact_number: rules.contact_number, format: item.content_type, pillar: item.pillar, scheduled_for: item.scheduled_for, angle: options.angle ?? null, planned_hook: options.planned_hook ?? null, slide_count: options.slides ?? null, target_seconds: item.content_type === "reel" ? seconds : null, word_budget: item.content_type === "reel" ? budget : null, direction: options.direction ?? null },
      task: [
        `FORMAT: ${item.content_type}.`,
        item.brief ? `BRIEF: ${item.brief}` : `BRIEF: ${item.title}`,
        note && item.script ? `REVISE THIS EXISTING SCRIPT (keep what works; apply the note):\n${item.script}\n\nNOTE FROM THE TEAM: ${note}` : "",
        'Return JSON: {"title": string, "hook": string, "script": string, "caption": string, "hashtags": [string]}',
      ].filter(Boolean).join("\n\n"),
      parse: (v) => {
        const s = scriptSchema.parse(v);
        if (![s.script, s.caption, s.hook].every((t) => safeText(ctx, t))) throw new Error("The draft failed the guardrails");
        return s;
      },
      fallback, maxTokens: 3000, effort: "medium",
    });
    const s = asked.value;
    await db.update("studio_items", { id: itemId }, {
      title: s.title.slice(0, 120), hook: s.hook, script: s.script, caption: s.caption,
      hashtags: s.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).slice(0, 14),
      status: "draft", error: null, ...(note ? { change_count: item.change_count + 1 } : {}),
    });
    await logAsk(ctx, note ? "revise_script" : "write_script", asked, { input: { item_id: itemId, format: item.content_type } });
    return { source: asked.source };
  });
}

// ---------------------------------------------------------------------------
// Calendar strategist
// ---------------------------------------------------------------------------
const outlineSchema = z.object({
  slots: z.array(z.object({ slot_index: z.number().int(), pillar: z.string(), title: z.string().max(120), angle: z.string(), hook: z.string().default(""), cta: z.string().default("") })),
  rationale: z.string().default(""),
});

/** Plan a week or four weeks: one item per slot, then each slot gets its script (one agent task each). */
export async function planStudioCalendar(deps: AgentDeps, planId: string): Promise<RunOutcome<{ items: number }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "plan_calendar", input: { plan_id: planId }, fallbackTitle: "Plan the content calendar" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const [plan] = await db.select<{ id: string; start_on: string; end_on: string; posts_per_week: number; mix: Record<string, number>; pillars: string[]; notes: string | null; status: string }>("studio_plans", { where: { id: planId } });
    if (!plan) throw new Error("Plan not found");
    const existing = await db.select<{ id: string }>("studio_items", { where: { plan_id: planId } });
    if (existing.length) return { items: 0 };
    const days = buildSlots(plan.start_on, plan.end_on, plan.posts_per_week);
    const formats = allocateFormats(days.length, plan.mix ?? {});
    const slots = days.map((d, i) => ({ slot_index: i, date: d, weekday: weekdayOf(d), format: formats[i]! }));
    const pillars = plan.pillars?.length ? plan.pillars : ["Venue showcase", "Educational / planning tips", "Feature focus", "Problem → solution", "Guest experience"];
    const recent = await db.select<{ title: string }>("studio_items", { where: { status: where.in(["draft", "approved", "generated"]) }, order: [{ column: "created_at", ascending: false }], limit: 30 });
    const brand = await brandFacts(ctx);
    const fallback = () => ({ slots: slots.map((s, i) => ({ slot_index: s.slot_index, pillar: pillars[i % pillars.length]!, title: `${pillars[i % pillars.length]} · ${s.weekday}`, angle: `A ${pillars[i % pillars.length]!.toLowerCase()} ${s.format.replace("_", " ")} for ${s.weekday}.`, hook: "", cta: "" })), rationale: "" });
    const asked = await askJson(ctx, {
      policies: POLICIES, persona: STRATEGIST,
      facts: { brand, slots, pillars, team_notes: plan.notes, recent_titles: recent.map((r) => r.title) },
      task: 'Plan every slot. Return JSON: {"slots": [{"slot_index": number, "pillar": string, "title": string, "angle": string, "hook": string, "cta": string}], "rationale": string}',
      parse: (v) => outlineSchema.parse(v), fallback, maxTokens: 6000, effort: "medium",
    });
    const byIndex = new Map(asked.value.slots.map((s) => [s.slot_index, s]));
    const fb = fallback().slots;
    const rows = slots.map((s) => {
      const o = byIndex.get(s.slot_index) ?? fb[s.slot_index]!;
      return {
        plan_id: planId, content_type: s.format, scheduled_for: s.date, pillar: o.pillar, title: o.title.slice(0, 120) || "Untitled",
        brief: o.angle, hook: o.hook || null, status: "drafting", created_by_agent: CONTENT_STUDIO, created_by: null,
        options: { angle: o.angle, planned_hook: o.hook || null, cta: o.cta || null, ...(s.format === "reel" ? { seconds: 30 } : s.format === "carousel" ? { aspect: "4:5" } : {}) },
      };
    });
    const inserted = await db.insert<{ id: string }>("studio_items", rows);
    await db.insert("agent_tasks", inserted.map((r) => ({ kind: "studio_script", from_agent: CONTENT_STUDIO, payload: { item_id: r.id } })));
    await db.update("studio_plans", { id: planId }, { status: "ready", rationale: asked.value.rationale || null });
    await logAsk(ctx, "plan_calendar", asked, { input: { plan_id: planId, slots: slots.length }, output: { items: inserted.length } });
    return { items: inserted.length };
  });
}

/** Weekly: plan next week's posts (scripts to read and approve in the Studio). */
export async function studioWeek(deps: AgentDeps): Promise<RunOutcome<{ planId: string | null }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "plan_week", input: {}, fallbackTitle: "Plan next week's posts in the Studio" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const today = istDate(ctx.now);
    const weekOf = addDays(today, 7 - DAYS.indexOf(istWeekday(ctx.now)));
    if (!(await claimRun(db, "studio_week", weekOf))) return { planId: null };
    const overlapping = await db.select<{ id: string }>("studio_plans", { where: { start_on: where.lte(addDays(weekOf, 6)), end_on: where.gte(weekOf) } });
    if (overlapping.length) return { planId: null };
    const rhythm = ctx.book.get("content.rhythm");
    const pillars = [...new Set(Object.values(rhythm.weekly))];
    const [plan] = await db.insert<{ id: string }>("studio_plans", { start_on: weekOf, end_on: addDays(weekOf, 6), posts_per_week: 4, pillars, notes: "Planned automatically for next week; read and approve each script in the Studio.", status: "planning", created_by: null, created_by_agent: CONTENT_STUDIO });
    await db.insert("agent_tasks", { kind: "studio_plan", from_agent: CONTENT_STUDIO, payload: { plan_id: plan!.id } });
    await ctx.log({ action: "plan_week", status: "ok", output: { plan_id: plan!.id, week_of: weekOf } });
    return { planId: plan!.id };
  });
}

// ---------------------------------------------------------------------------
// Carousel / single post / story: the deck plan
// ---------------------------------------------------------------------------
export interface SlideSpec { index: number; role: "hook" | "content" | "cta"; kicker: string | null; headline: string; support: string | null; asset_id: string | null; ai_visual: string | null; layout: "photo" | "split" | "type" }

const deckSchema = z.object({
  slides: z.array(z.object({
    role: z.enum(["hook", "content", "cta"]).catch("content"),
    kicker: z.string().max(40).nullable().catch(null),
    headline: z.string().min(1).max(90),
    support: z.string().max(200).nullable().catch(null),
    asset_id: z.string().nullable().catch(null),
    ai_visual: z.string().max(300).nullable().catch(null),
    layout: z.enum(["photo", "split", "type"]).catch("photo"),
  })).min(1).max(10),
});

/** Photos for slides when there is no model: decorated and event photos first, then plain ones. */
export function fallbackDeck(outline: { headline: string; support: string | null }[], manifest: ReadonlyMap<string, ManifestEntry>, preferred: readonly string[]): SlideSpec[] {
  const rank = (m: ManifestEntry) => ({ event: 0, decorated: 1, aerial: 2, plain: 3, people: 4, detail: 5, other: 6 } as Record<string, number>)[m.look] ?? 6;
  const photos = [...preferred.filter((id) => manifest.get(id)?.kind === "image"), ...[...manifest.values()].filter((m) => m.kind === "image" && !preferred.includes(m.id)).sort((a, b) => rank(a) - rank(b)).map((m) => m.id)];
  let p = 0;
  return outline.map((o, i) => {
    const last = i === outline.length - 1 && outline.length > 1;
    const asset = last ? null : photos[p++] ?? null;
    return { index: i, role: i === 0 ? "hook" : last ? "cta" : "content", kicker: null, headline: o.headline, support: o.support, asset_id: asset, ai_visual: null, layout: last || !asset ? "type" : "photo" };
  });
}

/** Turn the approved outline into slide specs with pictures chosen from the library. */
export async function planStudioDeck(deps: AgentDeps, itemId: string): Promise<RunOutcome<{ slides: SlideSpec[] }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "plan_deck", input: { item_id: itemId }, fallbackTitle: "Plan the slides of a carousel" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const [item] = await db.select<Item>("studio_items", { where: { id: itemId } });
    if (!item?.script) throw new Error("This script has no outline yet");
    const options = item.options ?? {};
    const chosen = Array.isArray(options.asset_ids) ? (options.asset_ids as string[]) : [];
    const { manifest } = await libraryManifest(ctx);
    let outline = parseOutline(item.script);
    if (item.content_type !== "carousel") outline = outline.slice(0, 1);
    const n = item.content_type === "carousel" ? Math.max(2, Math.min(10, Number(options.slides ?? outline.length) || outline.length)) : 1;
    outline = outline.slice(0, n);
    if (!outline.length) outline = [{ headline: item.hook ?? item.title, support: null }];
    const fallback = () => ({ slides: fallbackDeck(outline, manifest, chosen) });
    const library = [...manifest.values()].filter((m) => m.kind === "image").slice(0, 120).map((m) => ({ id: m.id, area: m.area, look: m.look, folder: m.folder, description: m.description }));
    const asked = await askJson(ctx, {
      policies: POLICIES, persona: DECK_PLANNER,
      facts: { format: item.content_type, contact_number: contactNumber(ctx), approved_outline: outline, photos_the_team_chose: chosen, direction: options.direction ?? null, library },
      task: `Plan exactly ${outline.length} slide${outline.length === 1 ? "" : "s"}. Return JSON: {"slides": [{"role": "hook"|"content"|"cta", "kicker": string|null, "headline": string, "support": string|null, "asset_id": string|null, "ai_visual": string|null, "layout": "photo"|"split"|"type"}]}`,
      parse: (v) => {
        const d = deckSchema.parse(v);
        const used = new Set<string>();
        const slides: SlideSpec[] = d.slides.slice(0, outline.length).map((s, i) => {
          const asset = s.asset_id && manifest.get(s.asset_id)?.kind === "image" && !used.has(s.asset_id) ? s.asset_id : null;
          if (asset) used.add(asset);
          return { index: i, role: s.role, kicker: s.kicker, headline: s.headline, support: s.support, asset_id: asset, ai_visual: asset ? null : s.ai_visual, layout: !asset && !s.ai_visual ? "type" : s.layout };
        });
        if (slides.length !== outline.length) throw new Error("Wrong number of slides");
        if (!slides.every((s) => safeText(ctx, [s.kicker, s.headline, s.support].filter(Boolean).join(" ")))) throw new Error("A slide failed the guardrails");
        return { slides };
      },
      fallback, maxTokens: 3500,
    });
    await logAsk(ctx, "plan_deck", asked, { input: { item_id: itemId }, output: { slides: asked.value.slides.length, ai: asked.value.slides.filter((s) => s.ai_visual).length } });
    return { slides: asked.value.slides };
  });
}

// ---------------------------------------------------------------------------
// Reels: the voice, then the shots, the AI stills and the music
// ---------------------------------------------------------------------------
const voiceSchema = z.object({ tts_text: z.string().min(1).max(8000), stability: z.number().min(0).max(1).catch(0.5) });

/** The TTS text: the approved script read in full, the number never spoken. */
export async function directStudioVoice(deps: AgentDeps, itemId: string): Promise<RunOutcome<{ text: string; stability: number }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "direct_voice", input: { item_id: itemId }, fallbackTitle: "Prepare a reel voiceover" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const [item] = await db.select<Item>("studio_items", { where: { id: itemId } });
    if (!item?.script) throw new Error("This reel has no script yet");
    const plain = spokenText(item.script);
    const asked = await askJson(ctx, {
      policies: POLICIES, persona: VOICE_DIRECTOR,
      facts: { approved_script: item.script },
      task: 'Return JSON: {"tts_text": string, "stability": 0.5}',
      parse: (v) => {
        const out = voiceSchema.parse(v);
        if (/\d{6,}/.test(out.tts_text.replace(/\s/g, ""))) throw new Error("The voice text still has the phone number");
        // Every approved word must still be there (tags and punctuation aside).
        const words = (t: string) => t.toLowerCase().replace(/\[[^\]]*\]/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
        const have = new Set(words(out.tts_text));
        const missing = words(plain).filter((w) => !have.has(w));
        if (missing.length > Math.max(2, words(plain).length * 0.05)) throw new Error("The voice text dropped approved words");
        return { tts_text: out.tts_text, stability: 0.5 };
      },
      fallback: () => ({ tts_text: plain, stability: 0.5 }), maxTokens: 3000,
    });
    await logAsk(ctx, "direct_voice", asked, { input: { item_id: itemId } });
    return { text: asked.value.tts_text, stability: asked.value.stability };
  });
}

const sceneSchema = z.object({ shots: z.array(z.object({ start: z.number(), end: z.number(), source: z.enum(["library", "ai"]).catch("library"), asset_id: z.string().nullable().catch(null), in_point: z.number().catch(0), visual: z.string().catch(""), motion: z.enum(["in", "out", "left", "right"]).catch("in"), transition_in: z.enum(["cut", "fade", "dissolve"]).catch("cut"), caption_text: z.string().nullable().catch(null) })).min(1) });
const artSchema = z.object({ prompts: z.array(z.object({ shot_index: z.number().int(), prompt: z.string().min(5).max(800) })) });
const musicSchema = z.object({ prompt: z.string().min(5).max(600) });

export interface ReelPlan { shots: Shot[]; aiPrompts: Record<number, string>; music: string }

/** Lay the shots on the voiceover timeline, write the AI-still prompts and the music brief. */
export async function planStudioReel(deps: AgentDeps, itemId: string, words: readonly Word[], totalSeconds: number, aiAllowed: boolean): Promise<RunOutcome<ReelPlan>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "plan_reel", input: { item_id: itemId, seconds: totalSeconds }, fallbackTitle: "Plan the shots of a reel" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const [item] = await db.select<Item>("studio_items", { where: { id: itemId } });
    if (!item) throw new Error("Reel not found");
    const options = item.options ?? {};
    const only = Array.isArray(options.asset_ids) && (options.asset_ids as string[]).length ? (options.asset_ids as string[]) : undefined;
    const { manifest } = await libraryManifest(ctx, only);
    if (manifest.size === 0 && !aiAllowed) throw new Error("The library has no ready photos or clips yet. Add some in Studio → Library first.");
    const maxShots = maxShotsFor(totalSeconds);
    const fallbackShots = (): Partial<Shot>[] => {
      const ids = [...manifest.keys()];
      const n = Math.max(1, Math.min(maxShots, ids.length || 1, Math.round(totalSeconds / 3.5)));
      const len = totalSeconds / n;
      return Array.from({ length: n }, (_, i) => ({ start: i * len, end: (i + 1) * len, source: (ids.length ? "library" : "ai") as Shot["source"], asset_id: ids[i] ?? null, visual: "A close detail: marigold and jasmine on brass", motion: (["in", "out", "left", "right"] as const)[i % 4]!, transition_in: i === Math.floor(n / 2) ? "dissolve" : "cut" }));
    };
    const scene = await askJson(ctx, {
      policies: POLICIES, persona: SCENE_DIRECTOR,
      facts: {
        voiceover_seconds: totalSeconds, words: words.map((w) => [Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100, w.text]).slice(0, 600),
        library: [...manifest.values()].slice(0, 150).map((m) => ({ id: m.id, kind: m.kind, duration_seconds: m.duration_seconds, area: m.area, look: m.look, folder: m.folder, description: m.description, tags: m.tags })),
        ai_shots_allowed: aiAllowed, max_shots: maxShots, direction: options.direction ?? null, revision_note: options.revision_note ?? null,
      },
      task: 'Plan the full shot list. Return JSON: {"shots": [{"start": number, "end": number, "source": "library"|"ai", "asset_id": string|null, "in_point": number, "visual": string, "motion": "in"|"out"|"left"|"right", "transition_in": "cut"|"fade"|"dissolve", "caption_text": string|null}]}',
      parse: (v) => sceneSchema.parse(v).shots, fallback: fallbackShots, maxTokens: 6000, effort: "medium",
    });
    const shots = normalizeShots(scene.value, totalSeconds, manifest, aiAllowed, maxShots);
    if (!shots.length) throw new Error("No shots could be planned from the library.");
    const ai = shots.filter((s) => s.source === "ai");
    let aiPrompts: Record<number, string> = {};
    if (ai.length) {
      const art = await askJson(ctx, {
        policies: POLICIES, persona: ART_DIRECTOR,
        facts: { shots: ai.map((s) => ({ shot_index: s.index, visual: s.visual, caption_text: s.caption_text })), direction: options.direction ?? null },
        task: 'One prompt per AI shot. Return JSON: {"prompts": [{"shot_index": number, "prompt": string}]}',
        parse: (v) => Object.fromEntries(artSchema.parse(v).prompts.map((p) => [p.shot_index, p.prompt])),
        fallback: () => Object.fromEntries(ai.map((s) => [s.index, `${s.visual || "Marigold and jasmine on a brass tray"}, a cinematic vertical photograph of a close detail, warm natural light, sage, ivory and gold palette, shallow depth of field, photoreal, no text, no people`])),
        maxTokens: 2500,
      });
      aiPrompts = art.value;
      for (const s of ai) aiPrompts[s.index] ??= `${s.visual}, cinematic vertical photograph of a close detail, warm natural light, photoreal, no text`;
    }
    const music = await askJson(ctx, {
      policies: POLICIES, persona: MUSIC_DIRECTOR,
      facts: { script: item.script, seconds: Math.ceil(totalSeconds) },
      task: 'Return JSON: {"prompt": string}',
      parse: (v) => musicSchema.parse(v).prompt,
      fallback: () => "Soft, elegant instrumental for a luxury Indian wedding venue: gentle piano and santoor over warm strings, a light shaker for pace, unhurried and emotional, no vocals.",
      maxTokens: 400,
    });
    await logAsk(ctx, "plan_reel", scene, { input: { item_id: itemId, seconds: totalSeconds }, output: { shots: shots.length, ai_shots: ai.length, library_shots: shots.length - ai.length } });
    return { shots, aiPrompts, music: music.value };
  });
}

// ---------------------------------------------------------------------------
// Librarian: describe a photo or a video's still
// ---------------------------------------------------------------------------
const describeSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(5).max(500),
  tags: z.array(z.string().max(30)).max(12).default([]),
  look: z.enum(["plain", "decorated", "event", "detail", "people", "aerial", "other"]).catch("other"),
});

export async function describeMediaAsset(deps: AgentDeps, assetId: string): Promise<RunOutcome<{ described: boolean }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "describe_asset", input: { asset_id: assetId }, fallbackTitle: "Describe a library photo" }, async (ctx) => {
    const db = agentDb(ctx, STUDIO_TOOLS);
    const [a] = await db.select<Asset & { described_by: string | null }>("media_assets", { where: { id: assetId } });
    if (!a) throw new Error("Photo not found");
    if (a.described_by === "staff") return { described: false };
    const image = a.kind === "image" ? a.url : a.thumb_url;
    if (!image || !ctx.deps.llm.available) return { described: false };
    const areas = await db.select<{ id: string; name: string }>("venue_areas", {});
    const asked = await askJson(ctx, {
      policies: ["venue.facts"], persona: LIBRARIAN, images: [image],
      facts: { kind: a.kind, current_title: a.title, area: a.venue_area_id ? areas.find((x) => x.id === a.venue_area_id)?.name ?? null : null, team_chose_look: a.look !== "other" ? a.look : null },
      task: 'Return JSON: {"title": string (3 to 8 words), "description": string (one or two sentences), "tags": [string], "look": "plain"|"decorated"|"event"|"detail"|"people"|"aerial"|"other"} where "plain" means the space with no décor.',
      parse: (v) => describeSchema.parse(v),
      fallback: () => ({ title: a.title ?? "Untitled", description: a.description ?? "", tags: a.tags ?? [], look: (a.look as z.infer<typeof describeSchema>["look"]) ?? "other" }),
      maxTokens: 600,
    });
    if (asked.source === "llm") {
      const v = asked.value;
      await db.update("media_assets", { id: assetId }, {
        title: a.title || v.title, description: v.description, tags: [...new Set([...(a.tags ?? []), ...v.tags.map((t) => t.toLowerCase())])].slice(0, 16),
        look: a.look !== "other" ? a.look : v.look, described_by: "ai",
      });
    }
    await logAsk(ctx, "describe_asset", asked, { input: { asset_id: assetId } });
    return { described: asked.source === "llm" };
  });
}
