import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  contactCueStart, directStudioVoice, groupWords, planStudioDeck, planStudioReel, spokenText, timeWordsEvenly, voiceDuration,
  type Shot, type SlideSpec, type Word,
} from "@wiwaha/agents";
import { todayIST } from "@wiwaha/db";
import { falAudioUrl, falImageUrl, falVideoUrl, falWords, type FalAdapter } from "@wiwaha/integrations";
import { PolicyBook } from "@wiwaha/policy";
import { estimateCostUsd, usdToPaise } from "./costs";
import sharp from "sharp";
import { agentDeps } from "../agents";
import { createAdminClient } from "../supabase/admin";
import { fal, falWebhookUrl, mediaModels, mediaPrices, requireModel, type MediaModels } from "./config";
import { assembleArgs, buildAss, clipShotArgs, photoShotArgs, posterArgs, run, silentAudioArgs } from "./reel";
import { fontDir, renderSlide, renderWordmarkPng, type Aspect, type Layout, type Scheme } from "./slide";
import { fetchMedia, mediaPath, putMedia } from "./storage";

/**
 * The media worker (D40, D41): moves moodboard slides and studio renders from
 * queued to ready. fal work is submitted and finished by the webhook (or the
 * sweep, if a webhook never came); local work (setting slides, cutting shots,
 * assembling reels) runs here. Every step claims its row first, so a webhook,
 * the 15-minute tick and a manual "check now" can all run it safely at once.
 */

type Admin = ReturnType<typeof createAdminClient>;
const db = (): Admin => createAdminClient("agent");

export interface WorkReport { submitted: number; finished: number; rendered: number; failed: number; more: boolean; notes: string[] }

interface Slide { id: string; moodboard_id: string; wedding_id: string; venue_area_id: string | null; base_url: string | null; reference_urls: string[]; prompt: string | null; engine: string; status: string; redo_count: number }
interface Item { id: string; content_type: "reel" | "carousel" | "single_post" | "story"; status: string; title: string; script: string | null; caption: string | null; hashtags: string[]; options: Record<string, unknown>; outputs: Record<string, unknown> }
interface Render { id: string; item_id: string; kind: "slide" | "shot" | "voice" | "music" | "reel"; idx: number; spec: Record<string, unknown>; status: string; source_url: string | null; result_url: string | null; edits: number }
interface Job { id: string; purpose: string; subject_table: string; subject_id: string; endpoint: string | null; request_id: string | null; status_url: string | null; response_url: string | null; status: string; input: Record<string, unknown>; attempts: number }

async function policyBook(): Promise<PolicyBook> {
  return PolicyBook.fromRows(await agentDeps().store.loadPolicyRows());
}

async function claim(table: string, id: string, from: string, to: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  const { data } = await db().from(table).update({ status: to, ...extra }).eq("id", id).eq("status", from).select("id");
  return (data ?? []).length > 0;
}

async function submitJob(f: FalAdapter, a: { purpose: string; subjectTable: string; subjectId: string; endpoint: string; input: Record<string, unknown> }): Promise<void> {
  const s = await f.submit(a.endpoint, a.input, falWebhookUrl());
  // What it was for, so its cost lands on the wedding (moodboards) or on marketing (studio).
  let weddingId: string | null = null, itemId: string | null = null;
  if (a.subjectTable === "moodboard_slides") weddingId = ((await db().from("moodboard_slides").select("wedding_id").eq("id", a.subjectId).maybeSingle()).data?.wedding_id as string | undefined) ?? null;
  if (a.subjectTable === "studio_renders") itemId = ((await db().from("studio_renders").select("item_id").eq("id", a.subjectId).maybeSingle()).data?.item_id as string | undefined) ?? null;
  const cost = estimateCostUsd(a.endpoint, a.input, await mediaPrices(weddingId ? "design" : "content_studio"));
  const { data: job, error } = await db().from("media_jobs").insert({
    purpose: a.purpose, subject_table: a.subjectTable, subject_id: a.subjectId, endpoint: a.endpoint,
    request_id: s.requestId, status_url: s.statusUrl, response_url: s.responseUrl, status: "submitted", input: a.input, submitted_at: new Date().toISOString(),
    cost_usd: cost, wedding_id: weddingId, item_id: itemId,
  }).select("id").single();
  if (error) throw new Error(`Couldn't record the fal job: ${error.message}`);
  if (cost) await recordSpend(job.id as string, cost, weddingId);
}

/**
 * The job's cost in rupees, added to one running line per wedding ("AI
 * moodboard pictures") or per month for the studio ("AI content"), so the
 * costs list stays readable.
 */
async function recordSpend(jobId: string, usd: number, weddingId: string | null): Promise<void> {
  try {
    const rate = (await policyBook()).get("media.budget").inr_per_usd;
    const paise = usdToPaise(usd, rate);
    const month = todayIST().slice(0, 7);
    const label = weddingId ? "AI moodboard pictures (fal)" : `AI content for marketing (fal), ${month}`;
    let q = db().from("cost_entries").select("id, amount_paise").eq("description", label).eq("category", weddingId ? "decor" : "marketing").limit(1);
    q = weddingId ? q.eq("wedding_id", weddingId) : q.is("wedding_id", null);
    const { data: line } = await q.maybeSingle();
    let id = line?.id as string | undefined;
    if (line) await db().from("cost_entries").update({ amount_paise: Number(line.amount_paise) + paise }).eq("id", line.id);
    else id = ((await db().from("cost_entries").insert({ wedding_id: weddingId, category: weddingId ? "decor" : "marketing", amount_paise: paise, description: label }).select("id").single()).data?.id as string | undefined);
    if (id) await db().from("media_jobs").update({ cost_entry_id: id }).eq("id", jobId);
  } catch {
    // Spend tracking never blocks a render.
  }
}


async function toJpeg(buf: Buffer, maxEdge = 2048): Promise<Buffer> {
  return sharp(buf).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

// ---------------------------------------------------------------------------
// Moodboard slides
// ---------------------------------------------------------------------------
async function boardDone(moodboardId: string): Promise<void> {
  const { data } = await db().from("moodboard_slides").select("status").eq("moodboard_id", moodboardId);
  if ((data ?? []).some((s) => s.status === "queued" || s.status === "rendering")) return;
  const { data: board } = await db().from("moodboards").select("wedding_id").eq("id", moodboardId).maybeSingle();
  await db().from("agent_tasks").insert({ kind: "moodboard_rendered", wedding_id: board?.wedding_id ?? null, payload: { moodboard_id: moodboardId } });
}

async function workSlides(report: WorkReport, deadline: number): Promise<void> {
  const { data } = await db().from("moodboard_slides").select("id, moodboard_id, wedding_id, venue_area_id, base_url, reference_urls, prompt, engine, status, redo_count").eq("status", "queued").order("created_at").limit(10);
  const slides = (data ?? []) as Slide[];
  if (!slides.length) return;
  const f = fal();
  const models = f.live ? await mediaModels("design") : {};
  for (const s of slides) {
    if (Date.now() > deadline) { report.more = true; return; }
    if (s.engine === "ai" && s.base_url && f.live) {
      if (!(await claim("moodboard_slides", s.id, "queued", "rendering"))) continue;
      try {
        await submitJob(f, {
          purpose: "moodboard_slide", subjectTable: "moodboard_slides", subjectId: s.id, endpoint: requireModel(models, "image_edit"),
          input: { prompt: s.prompt ?? "", image_urls: [s.base_url, ...(s.reference_urls ?? []).slice(0, 2)], num_images: 1, aspect_ratio: "auto", output_format: "jpeg", resolution: "1K" },
        });
        report.submitted++;
      } catch (e) {
        await db().from("moodboard_slides").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", s.id);
        report.failed++;
        await boardDone(s.moodboard_id);
      }
      continue;
    }
    // No AI available for this slide: our own template photo stands in, or a
    // real decorated photo of the same area, clearly labelled.
    let ref = (s.reference_urls ?? [])[0] ?? null;
    let from = "our template photo for this area";
    if (!ref && s.venue_area_id) {
      const { data: past } = await db().from("media_assets").select("url").eq("venue_area_id", s.venue_area_id).eq("kind", "image").in("look", ["decorated", "event"]).eq("status", "ready").order("created_at", { ascending: false }).limit(1);
      ref = (past?.[0]?.url as string | undefined) ?? null;
      from = "a past event in this space";
    }
    const off = !f.live ? "AI pictures are off until FAL_KEY is set" : "No plain photo of this area to dress";
    const patch = ref
      ? { status: "ready", engine: "reference", result_url: ref, error: s.engine === "ai" ? `${off}: showing ${from}.` : null }
      : { status: "failed", error: s.engine === "ai" ? `${off}, and there's no template or past-event photo for this area yet.` : "No plain photo or template photo for this area yet." };
    if (await claim("moodboard_slides", s.id, "queued", patch.status, patch)) {
      if (patch.status === "ready") report.rendered++; else report.failed++;
      await boardDone(s.moodboard_id);
    }
  }
}

// ---------------------------------------------------------------------------
// Studio: starting an approved item
// ---------------------------------------------------------------------------
async function brand(): Promise<{ logo: string | null; logoLight: string | null; mark: string | null; name: string }> {
  const { data } = await db().from("studio_brand").select("profile, logo_url, logo_light_url, mark_url").eq("id", 1).maybeSingle();
  const p = (data?.profile ?? {}) as { brand_name?: string };
  return { logo: data?.logo_url ?? null, logoLight: data?.logo_light_url ?? null, mark: data?.mark_url ?? null, name: p.brand_name ?? "WIWAHA by Praman" };
}

async function progress(itemId: string, p: Record<string, unknown>): Promise<void> {
  await db().from("studio_items").update({ progress: { ...p, at: new Date().toISOString() } }).eq("id", itemId);
}

async function failItem(itemId: string, message: string): Promise<void> {
  await db().from("studio_items").update({ status: "failed", error: message.slice(0, 1000) }).eq("id", itemId);
}

const aspectFor = (item: Item): Aspect => (item.content_type === "story" ? "9:16" : ((item.options.aspect as Aspect | undefined) ?? (item.content_type === "single_post" ? "4:5" : "4:5")));
const falAspect: Record<Aspect, string> = { "4:5": "4:5", "1:1": "1:1", "9:16": "9:16" };

async function startItem(item: Item, report: WorkReport): Promise<void> {
  if (!(await claim("studio_items", item.id, "approved", "generating", { error: null, progress: { stage: "planning" } }))) return;
  const f = fal();
  const models: Partial<MediaModels> = f.live ? await mediaModels("content_studio") : {};
  const deps = agentDeps();
  // A regeneration starts clean.
  await db().from("studio_renders").delete().eq("item_id", item.id);
  if (item.content_type === "reel") {
    const v = await directStudioVoice(deps, item.id);
    if (v.status !== "done") return failItem(item.id, v.status === "error" ? v.error : "The Content Studio is switched off");
    if (f.live) {
      const { data: r } = await db().from("studio_renders").insert({ item_id: item.id, kind: "voice", idx: 0, status: "rendering", spec: { text: v.result.text } }).select("id").single();
      try {
        await submitJob(f, { purpose: "studio_voice", subjectTable: "studio_renders", subjectId: r!.id as string, endpoint: requireModel(models, "tts"), input: { text: v.result.text, voice: models.voice ?? "Aria", stability: v.result.stability, timestamps: true } });
        report.submitted++;
      } catch (e) {
        await failItem(item.id, `The voiceover couldn't start: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      const book = await policyBook();
      const words = timeWordsEvenly(spokenText(item.script ?? ""), book.get("studio.content").words_per_second);
      await db().from("studio_renders").insert({ item_id: item.id, kind: "voice", idx: 0, status: "ready", spec: { text: v.result.text, words, duration: voiceDuration(words, 15), silent: true } });
    }
    await progress(item.id, { stage: "voiceover" });
    return;
  }
  const plan = await planStudioDeck(deps, item.id);
  if (plan.status !== "done") return failItem(item.id, plan.status === "error" ? plan.error : "The Content Studio is switched off");
  const ids = plan.result.slides.map((s) => s.asset_id).filter((x): x is string => !!x);
  const { data: assets } = ids.length ? await db().from("media_assets").select("id, url").in("id", ids) : { data: [] };
  const urls = new Map((assets ?? []).map((a) => [a.id as string, a.url as string]));
  const aspect = aspectFor(item);
  const scheme = ((item.options.scheme as Scheme | undefined) ?? "light");
  for (const s of plan.result.slides) {
    const ai = !!s.ai_visual && f.live;
    const spec = { ...s, aspect, scheme, layout: s.ai_visual && !f.live ? "type" : s.layout };
    const { data: r } = await db().from("studio_renders").insert({ item_id: item.id, kind: "slide", idx: s.index, spec, status: ai ? "rendering" : "queued", source_url: s.asset_id ? urls.get(s.asset_id) ?? null : null }).select("id").single();
    if (ai) {
      try {
        await submitJob(f, { purpose: "studio_bg", subjectTable: "studio_renders", subjectId: r!.id as string, endpoint: requireModel(models, "image"), input: { prompt: aiVisualPrompt(s.ai_visual!), num_images: 1, aspect_ratio: falAspect[aspect], output_format: "jpeg" } });
        report.submitted++;
      } catch {
        await db().from("studio_renders").update({ status: "queued", spec: { ...spec, layout: "type" } }).eq("id", r!.id);
      }
    }
  }
  await progress(item.id, { stage: "slides", total: plan.result.slides.length, done: 0 });
}

export function aiVisualPrompt(visual: string): string {
  return `${visual}. A refined editorial photograph for a luxury Indian wedding venue's Instagram: one subject, one focal point, warm natural light, earthy palette of sage, ivory and warm gold, generous negative space in the lower half for type. Photoreal. No text, no letters, no logos, no watermark, no identifiable faces, and no buildings, lawns, halls, stages or wedding venues.`;
}

// ---------------------------------------------------------------------------
// Studio: local steps
// ---------------------------------------------------------------------------
async function composeSlide(r: Render, report: WorkReport): Promise<void> {
  if (!(await claim("studio_renders", r.id, "queued", "rendering"))) return;
  try {
    const [b, book] = await Promise.all([brand(), policyBook()]);
    const spec = r.spec as unknown as SlideSpec & { aspect: Aspect; scheme: Scheme; layout: Layout; bg_url?: string };
    const img = await renderSlide({
      aspect: spec.aspect, layout: spec.layout, scheme: spec.scheme, role: spec.role, kicker: spec.kicker, headline: spec.headline, support: spec.support,
      imageUrl: spec.bg_url ?? r.source_url, contactNumber: book.get("studio.content").contact_number, logoDarkUrl: b.logo, logoLightUrl: b.logoLight, brandName: b.name,
    });
    const url = await putMedia(mediaPath(`studio/${r.item_id}`, "jpg"), img, "image/jpeg");
    await db().from("studio_renders").update({ status: "ready", result_url: url, error: null }).eq("id", r.id);
    report.rendered++;
  } catch (e) {
    await db().from("studio_renders").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", r.id);
    report.failed++;
  }
}

async function cutShot(r: Render, report: WorkReport): Promise<void> {
  if (!(await claim("studio_renders", r.id, "queued", "rendering"))) return;
  const tmp = await mkdtemp(path.join(os.tmpdir(), "shot-"));
  try {
    const shot = r.spec as unknown as Shot & { kind?: "image" | "video"; still_url?: string; clip_url?: string };
    const src = shot.clip_url ?? shot.still_url ?? r.source_url;
    if (!src) throw new Error("No picture for this shot");
    const isVideo = !!shot.clip_url || (shot.kind === "video" && !shot.still_url);
    const input = path.join(tmp, isVideo ? "in.mp4" : "in.jpg");
    const raw = await fetchMedia(src);
    await writeFile(input, isVideo ? raw : await toJpeg(raw, 2400));
    const out = path.join(tmp, "shot.mp4");
    const length = Math.max(0.5, shot.end - shot.start);
    await run(isVideo ? clipShotArgs(input, out, shot.clip_url ? 0 : shot.in_point, length) : photoShotArgs(input, out, length + (shot.transition_in === "cut" ? 0 : 0.35), shot.motion));
    const url = await putMedia(mediaPath(`studio/${r.item_id}/shots`, "mp4"), await readFile(out), "video/mp4");
    await db().from("studio_renders").update({ status: "ready", result_url: url, error: null }).eq("id", r.id);
    report.rendered++;
  } catch (e) {
    await db().from("studio_renders").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", r.id);
    report.failed++;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function planReel(item: Item, voice: Render, report: WorkReport): Promise<void> {
  const f = fal();
  const book = await policyBook();
  const words = (voice.spec.words ?? []) as Word[];
  const total = Number(voice.spec.duration ?? voiceDuration(words, 15));
  const plan = await planStudioReel(agentDeps(), item.id, words, total, f.live);
  if (plan.status !== "done") return failItem(item.id, plan.status === "error" ? plan.error : "The Content Studio is switched off");
  const models: Partial<MediaModels> = f.live ? await mediaModels("content_studio") : {};
  const ids = plan.result.shots.map((s) => s.asset_id).filter((x): x is string => !!x);
  const { data: assets } = ids.length ? await db().from("media_assets").select("id, url, kind").in("id", ids) : { data: [] };
  const byId = new Map((assets ?? []).map((a) => [a.id as string, a as { url: string; kind: "image" | "video" }]));
  const maxClips = book.get("studio.content").max_ai_clips_per_reel;
  const animate = new Set(plan.result.shots.filter((s) => s.source === "ai").sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, maxClips).map((s) => s.index));
  for (const s of plan.result.shots) {
    const lib = s.asset_id ? byId.get(s.asset_id) : undefined;
    const spec = { ...s, kind: lib?.kind ?? "image", animate: animate.has(s.index), ai_prompt: plan.result.aiPrompts[s.index] ?? null };
    const isAi = s.source === "ai";
    const { data: r } = await db().from("studio_renders").insert({ item_id: item.id, kind: "shot", idx: s.index, spec, source_url: lib?.url ?? null, status: isAi ? "rendering" : "queued" }).select("id").single();
    if (isAi) {
      try {
        await submitJob(f, { purpose: "studio_still", subjectTable: "studio_renders", subjectId: r!.id as string, endpoint: requireModel(models, "image"), input: { prompt: spec.ai_prompt ?? aiVisualPrompt(s.visual), num_images: 1, aspect_ratio: "9:16", output_format: "jpeg" } });
        report.submitted++;
      } catch (e) {
        await db().from("studio_renders").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", r!.id);
      }
    }
  }
  const { data: m } = await db().from("studio_renders").insert({ item_id: item.id, kind: "music", idx: 0, spec: { prompt: plan.result.music }, status: f.live ? "rendering" : "skipped" }).select("id").single();
  if (f.live) {
    try {
      await submitJob(f, { purpose: "studio_music", subjectTable: "studio_renders", subjectId: m!.id as string, endpoint: requireModel(models, "music"), input: { prompt: plan.result.music, music_length_ms: Math.ceil(total * 1000) + 1500, force_instrumental: true } });
      report.submitted++;
    } catch {
      await db().from("studio_renders").update({ status: "skipped" }).eq("id", m!.id);
    }
  }
  await progress(item.id, { stage: "shots", total: plan.result.shots.length, done: 0 });
}

async function assembleReel(item: Item, renders: Render[], report: WorkReport): Promise<void> {
  const voice = renders.find((r) => r.kind === "voice")!;
  const music = renders.find((r) => r.kind === "music");
  const shots = renders.filter((r) => r.kind === "shot" && r.status === "ready" && r.result_url).sort((a, b) => a.idx - b.idx);
  if (!shots.length) return failItem(item.id, "None of the shots could be made.");
  const { data: claimed } = await db().from("studio_renders").insert({ item_id: item.id, kind: "reel", idx: 0, status: "rendering", spec: {} }).select("id");
  if (!claimed?.length) return; // another worker is already assembling (unique item/kind/idx)
  const reelId = claimed[0]!.id as string;
  await progress(item.id, { stage: "assembling" });
  const tmp = await mkdtemp(path.join(os.tmpdir(), "reel-"));
  try {
    const words = (voice.spec.words ?? []) as Word[];
    const total = Number(voice.spec.duration ?? voiceDuration(words, 15));
    const shotFiles: { path: string; duration: number; transition: "cut" | "fade" | "dissolve" }[] = [];
    // Failed shots are covered by stretching the neighbour before them.
    const all = renders.filter((r) => r.kind === "shot").sort((a, b) => a.idx - b.idx);
    for (const r of shots) {
      const s = r.spec as unknown as Shot;
      const next = all.find((x) => x.idx > r.idx && x.status === "ready");
      const end = next ? (next.spec as unknown as Shot).start : total;
      const p = path.join(tmp, `s${r.idx}.mp4`);
      await writeFile(p, await fetchMedia(r.result_url!));
      shotFiles.push({ path: p, duration: Math.max(0.5, end - s.start + (next && (next.spec as unknown as Shot).transition_in !== "cut" ? 0.35 : 0)), transition: s.transition_in });
    }
    if (shotFiles.length) shotFiles[0]!.transition = "cut";
    let voicePath: string | null = null;
    if (voice.result_url) { voicePath = path.join(tmp, "voice.mp3"); await writeFile(voicePath, await fetchMedia(voice.result_url)); }
    let musicPath: string | null = null;
    if (music?.status === "ready" && music.result_url) { musicPath = path.join(tmp, "music.mp3"); await writeFile(musicPath, await fetchMedia(music.result_url)); }
    if (!voicePath && !musicPath) { voicePath = path.join(tmp, "silence.mp3"); await run(silentAudioArgs(total, voicePath)); }
    const [b, book] = await Promise.all([brand(), policyBook()]);
    const logoPath = path.join(tmp, "logo.png");
    const logoSrc = b.mark ?? b.logoLight;
    await writeFile(logoPath, logoSrc ? await sharp(await fetchMedia(logoSrc)).png().toBuffer() : await renderWordmarkPng());
    const cueStart = contactCueStart(words);
    const contact = book.get("studio.content").contact_number;
    const assPath = path.join(tmp, "captions.ass");
    await writeFile(assPath, buildAss(groupWords(words), cueStart !== null && contact ? { text: contact, start: cueStart } : null, total));
    const out = path.join(tmp, "reel.mp4");
    await run(assembleArgs({ shots: shotFiles, voice: voicePath, music: musicPath, logo: logoPath, ass: assPath, fontsDir: fontDir(), total, output: out }), 280_000);
    const poster = path.join(tmp, "poster.jpg");
    await run(posterArgs(out, poster));
    const videoUrl = await putMedia(mediaPath(`studio/${item.id}`, "mp4"), await readFile(out), "video/mp4");
    const posterUrl = await putMedia(mediaPath(`studio/${item.id}`, "jpg"), await readFile(poster), "image/jpeg");
    await db().from("studio_renders").update({ status: "ready", result_url: videoUrl, spec: { poster_url: posterUrl, seconds: total } }).eq("id", reelId);
    await db().from("studio_items").update({
      status: "generated", error: null, progress: { stage: "done" },
      outputs: { video_url: videoUrl, poster_url: posterUrl, seconds: Math.round(total * 10) / 10, silent: !voice.result_url, music: !!musicPath, shots: shotFiles.length, failed_shots: all.length - shots.length },
    }).eq("id", item.id);
    report.rendered++;
  } catch (e) {
    await db().from("studio_renders").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", reelId);
    await failItem(item.id, `The reel couldn't be assembled: ${e instanceof Error ? e.message : String(e)}`);
    report.failed++;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function advanceItems(report: WorkReport, deadline: number): Promise<void> {
  const { data: approved } = await db().from("studio_items").select("id, content_type, status, title, script, caption, hashtags, options, outputs").eq("status", "approved").order("approved_at").limit(3);
  for (const item of (approved ?? []) as Item[]) {
    if (Date.now() > deadline) { report.more = true; return; }
    try { await startItem(item, report); } catch (e) { await failItem(item.id, e instanceof Error ? e.message : String(e)); report.failed++; }
  }
  const { data: going } = await db().from("studio_items").select("id, content_type, status, title, script, caption, hashtags, options, outputs").eq("status", "generating").order("updated_at").limit(10);
  for (const item of (going ?? []) as Item[]) {
    if (Date.now() > deadline) { report.more = true; return; }
    const { data } = await db().from("studio_renders").select("id, item_id, kind, idx, spec, status, source_url, result_url, edits").eq("item_id", item.id).order("idx");
    const renders = (data ?? []) as Render[];
    if (item.content_type !== "reel") {
      for (const r of renders.filter((x) => x.kind === "slide" && x.status === "queued")) {
        if (Date.now() > deadline) { report.more = true; return; }
        await composeSlide(r, report);
      }
      const fresh = (await db().from("studio_renders").select("status, result_url, idx").eq("item_id", item.id).eq("kind", "slide").order("idx")).data ?? [];
      await progress(item.id, { stage: "slides", total: fresh.length, done: fresh.filter((r) => r.status === "ready").length });
      if (fresh.length && fresh.every((r) => r.status === "ready" || r.status === "failed")) {
        const ok = fresh.filter((r) => r.status === "ready");
        await db().from("studio_items").update(ok.length === fresh.length
          ? { status: "generated", error: null, progress: { stage: "done" }, outputs: { slides: ok.map((r) => r.result_url) } }
          : { status: "failed", error: `${fresh.length - ok.length} slide${fresh.length - ok.length === 1 ? "" : "s"} couldn't be made. Try again, or edit those slides.`, outputs: { slides: fresh.map((r) => r.result_url) } }).eq("id", item.id);
      }
      continue;
    }
    const voice = renders.find((r) => r.kind === "voice");
    if (!voice || voice.status === "rendering") continue;
    if (voice.status === "failed") { await failItem(item.id, "The voiceover couldn't be made."); continue; }
    const shots = renders.filter((r) => r.kind === "shot");
    if (!shots.length) { await planReel(item, voice, report); report.more = true; continue; }
    for (const r of shots.filter((x) => x.status === "queued")) {
      if (Date.now() > deadline) { report.more = true; return; }
      await cutShot(r, report);
    }
    const now = ((await db().from("studio_renders").select("id, item_id, kind, idx, spec, status, source_url, result_url, edits").eq("item_id", item.id)).data ?? []) as Render[];
    const pendingShots = now.filter((r) => r.kind === "shot" && (r.status === "queued" || r.status === "rendering"));
    await progress(item.id, { stage: "shots", total: now.filter((r) => r.kind === "shot").length, done: now.filter((r) => r.kind === "shot" && r.status === "ready").length });
    const musicWaiting = now.some((r) => r.kind === "music" && r.status === "rendering");
    if (!pendingShots.length && !musicWaiting && !now.some((r) => r.kind === "reel")) {
      if (Date.now() > deadline - 120_000) { report.more = true; return; }
      await assembleReel(item, now, report);
    }
  }
}

// ---------------------------------------------------------------------------
// Finishing fal jobs (webhook, or the sweep when a webhook never came)
// ---------------------------------------------------------------------------
export async function finishJob(job: Job, output: Record<string, unknown> | null, error: string | null): Promise<void> {
  if (!(await claim("media_jobs", job.id, "submitted", error ? "failed" : "done", { completed_at: new Date().toISOString(), result: output ?? null, error }))) return;
  const fail = async (table: string, msg: string) => db().from(table).update({ status: "failed", error: msg.slice(0, 500) }).eq("id", job.subject_id);
  try {
    if (job.purpose === "moodboard_slide") {
      const { data: s } = await db().from("moodboard_slides").select("moodboard_id, wedding_id, reference_urls").eq("id", job.subject_id).maybeSingle();
      if (!s) return;
      const url = output ? falImageUrl(output) : null;
      if (error || !url) {
        const ref = ((s.reference_urls ?? []) as string[])[0];
        await db().from("moodboard_slides").update(ref ? { status: "ready", engine: "reference", result_url: ref, error: `The AI picture failed (${error ?? "no image"}); showing our template photo.` } : { status: "failed", error: `The AI picture failed: ${error ?? "no image came back"}` }).eq("id", job.subject_id);
      } else {
        const stored = await putMedia(mediaPath(`moodboards/${s.wedding_id}`, "jpg"), await toJpeg(await fetchMedia(url)), "image/jpeg");
        await db().from("moodboard_slides").update({ status: "ready", result_url: stored, error: null }).eq("id", job.subject_id);
      }
      await boardDone(s.moodboard_id as string);
      return;
    }
    const { data: r } = await db().from("studio_renders").select("id, item_id, kind, spec").eq("id", job.subject_id).maybeSingle();
    if (!r) return;
    const spec = (r.spec ?? {}) as Record<string, unknown>;
    if (job.purpose === "studio_bg") {
      const url = output ? falImageUrl(output) : null;
      if (error || !url) { await db().from("studio_renders").update({ status: "queued", spec: { ...spec, layout: "type" } }).eq("id", r.id); return; }
      const stored = await putMedia(mediaPath(`studio/${r.item_id}/ai`, "jpg"), await toJpeg(await fetchMedia(url)), "image/jpeg");
      await db().from("studio_renders").update({ status: "queued", spec: { ...spec, bg_url: stored } }).eq("id", r.id);
    } else if (job.purpose === "studio_voice") {
      const url = output ? falAudioUrl(output) : null;
      if (error || !url) { await fail("studio_renders", `The voiceover failed: ${error ?? "no audio"}`); return; }
      const words = falWords(output!);
      const stored = await putMedia(mediaPath(`studio/${r.item_id}`, "mp3"), await fetchMedia(url), "audio/mpeg");
      const fallbackWords = words.length ? words : timeWordsEvenly(String(spec.text ?? ""), 2.3);
      await db().from("studio_renders").update({ status: "ready", result_url: stored, spec: { ...spec, words: fallbackWords, duration: voiceDuration(fallbackWords, 15), timed: words.length > 0 } }).eq("id", r.id);
    } else if (job.purpose === "studio_still") {
      const url = output ? falImageUrl(output) : null;
      if (error || !url) { await fail("studio_renders", `The AI still failed: ${error ?? "no image"}`); return; }
      const stored = await putMedia(mediaPath(`studio/${r.item_id}/ai`, "jpg"), await toJpeg(await fetchMedia(url)), "image/jpeg");
      if (spec.animate && fal().live) {
        const models = await mediaModels("content_studio");
        const shot = spec as unknown as Shot;
        try {
          await submitJob(fal(), { purpose: "studio_clip", subjectTable: "studio_renders", subjectId: r.id as string, endpoint: requireModel(models, "image_to_video"), input: { prompt: `${shot.visual || "gentle motion"}; a slow, gentle camera push-in, soft natural movement`, image_url: stored, duration: Math.max(5, Math.min(10, Math.round(shot.end - shot.start) + 1)), resolution: "768P", prompt_expansion_mode: "balanced" } });
          await db().from("studio_renders").update({ spec: { ...spec, still_url: stored } }).eq("id", r.id);
          return;
        } catch {
          // fall back to a moving still
        }
      }
      await db().from("studio_renders").update({ status: "queued", spec: { ...spec, still_url: stored } }).eq("id", r.id);
    } else if (job.purpose === "studio_clip") {
      const url = output ? falVideoUrl(output) : null;
      // A clip that fails falls back to the still with a slow move.
      if (error || !url) { await db().from("studio_renders").update({ status: "queued" }).eq("id", r.id); return; }
      const stored = await putMedia(mediaPath(`studio/${r.item_id}/ai`, "mp4"), await fetchMedia(url), "video/mp4");
      await db().from("studio_renders").update({ status: "queued", spec: { ...spec, clip_url: stored } }).eq("id", r.id);
    } else if (job.purpose === "studio_music") {
      const url = output ? falAudioUrl(output) : null;
      if (error || !url) { await db().from("studio_renders").update({ status: "skipped", error: error ?? "no audio" }).eq("id", r.id); return; }
      const stored = await putMedia(mediaPath(`studio/${r.item_id}`, "mp3"), await fetchMedia(url), "audio/mpeg");
      await db().from("studio_renders").update({ status: "ready", result_url: stored }).eq("id", r.id);
    }
  } catch (e) {
    await db().from(job.subject_table).update({ status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).eq("id", job.subject_id);
  }
}

/** Poll jobs whose webhook hasn't arrived (localhost, a missed delivery). */
async function sweepJobs(report: WorkReport, deadline: number): Promise<void> {
  const f = fal();
  if (!f.live) return;
  const stale = new Date(Date.now() - (falWebhookUrl() ? 90_000 : 5_000)).toISOString();
  const { data } = await db().from("media_jobs").select("id, purpose, subject_table, subject_id, endpoint, request_id, status_url, response_url, status, input, attempts").eq("status", "submitted").lt("updated_at", stale).order("created_at").limit(15);
  for (const job of (data ?? []) as Job[]) {
    if (Date.now() > deadline) { report.more = true; return; }
    try {
      const st = await f.status(job.status_url!);
      if (st.status !== "COMPLETED") {
        await db().from("media_jobs").update({ attempts: job.attempts + 1 }).eq("id", job.id);
        // Give up after about two hours of waiting.
        if (job.attempts > 80) await finishJob(job, null, "fal never finished this request");
        else report.more = true;
        continue;
      }
      if (st.error) { await finishJob(job, null, st.error); continue; }
      await finishJob(job, await f.result(job.response_url!), null);
      report.finished++;
    } catch (e) {
      await db().from("media_jobs").update({ attempts: job.attempts + 1, error: e instanceof Error ? e.message : String(e) }).eq("id", job.id);
      if (job.attempts > 80) await finishJob(job, null, e instanceof Error ? e.message : String(e));
    }
  }
}

/** One pass of the worker within a time budget. `more` = call again soon. */
export async function runMediaWork(budgetMs = 200_000): Promise<WorkReport> {
  const deadline = Date.now() + budgetMs;
  const report: WorkReport = { submitted: 0, finished: 0, rendered: 0, failed: 0, more: false, notes: [] };
  await sweepJobs(report, deadline);
  await workSlides(report, deadline);
  await advanceItems(report, deadline);
  const { count: queuedSlides } = await db().from("moodboard_slides").select("id", { count: "exact", head: true }).eq("status", "queued");
  const { count: open } = await db().from("studio_items").select("id", { count: "exact", head: true }).in("status", ["approved", "generating"]);
  const { count: jobs } = await db().from("media_jobs").select("id", { count: "exact", head: true }).eq("status", "submitted");
  report.more ||= (queuedSlides ?? 0) > 0 || ((open ?? 0) > 0 && (jobs ?? 0) === 0);
  if ((jobs ?? 0) > 0) report.notes.push(`${jobs} fal request${jobs === 1 ? "" : "s"} in progress`);
  return report;
}
