"use server";
import { STUDIO_CONTENT_TYPES, todayIST, type StudioContentType } from "@wiwaha/db";
import { PolicyBook } from "@wiwaha/policy";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { agentDeps, runRouting } from "@/lib/agents";
import { requireSection } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { kickMediaWorker } from "@/lib/media/kick";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; id?: string };
const ROLES = ["owner", "sales"] as const;
const done = (error?: { message?: string; code?: string } | null, id?: string): Result => {
  revalidatePath("/team/studio", "layout");
  return error ? { error: friendlyError(error) } : id ? { id } : {};
};
const isType = (v: unknown): v is StudioContentType => typeof v === "string" && (STUDIO_CONTENT_TYPES as readonly string[]).includes(v);

async function book(): Promise<PolicyBook> {
  return PolicyBook.fromRows(await agentDeps().store.loadPolicyRows());
}

/** Renders used this month (IST) and the allowance from the policy book. */
export async function usageThisMonth(): Promise<{ used: number; allowance: number; warnAt: number }> {
  const supabase = await createClient("team");
  const month = `${todayIST().slice(0, 7)}-01T00:00:00+05:30`;
  const { data } = await supabase.from("studio_usage").select("units").in("kind", ["generation", "regeneration"]).gte("created_at", month);
  const rules = (await book()).get("studio.content");
  return { used: (data ?? []).reduce((s, r) => s + Number(r.units), 0), allowance: rules.monthly_generations, warnAt: Math.ceil(rules.monthly_generations * (rules.warn_at_pct / 100)) };
}

export interface NewItem { type: string; brief: string; pillar: string; slides: string; seconds: string; aspect: string; scheme: string; assetIds: string[]; direction: string; scheduledFor: string }

/** A new post from a brief: the Content Studio writes the script; you read and approve it. */
export async function createStudioItem(n: NewItem): Promise<Result> {
  const viewer = await requireSection("sales_marketing", ROLES);
  if (!isType(n.type)) return { error: "Choose a format." };
  const brief = n.brief.trim();
  if (brief.length < 5) return { error: "Tell the studio what the post is about." };
  const options: Record<string, unknown> = { direction: n.direction.trim() || null, asset_ids: n.assetIds.slice(0, 20), scheme: n.scheme === "dark" ? "dark" : "light" };
  if (n.type === "carousel") { options.slides = Math.max(3, Math.min(10, Number(n.slides) || 6)); options.aspect = n.aspect === "1:1" ? "1:1" : "4:5"; }
  if (n.type === "single_post") options.aspect = n.aspect === "1:1" ? "1:1" : "4:5";
  if (n.type === "reel") options.seconds = [15, 30, 45, 60].includes(Number(n.seconds)) ? Number(n.seconds) : 30;
  const supabase = await createClient("team");
  const { data, error } = await supabase.from("studio_items").insert({
    content_type: n.type, title: brief.slice(0, 60), brief: brief.slice(0, 2000), pillar: n.pillar || null, options, status: "drafting",
    scheduled_for: /^\d{4}-\d{2}-\d{2}$/.test(n.scheduledFor) ? n.scheduledFor : null, created_by: viewer.userId,
  }).select("id").single();
  if (error) return done(error);
  // Agent tasks are written by the system, never by a person's session.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient("system").from("agent_tasks").insert({ kind: "studio_script", payload: { item_id: data.id } });
  after(runRouting);
  return done(null, data.id as string);
}

export interface ScriptEdit { title: string; hook: string; script: string; caption: string; hashtags: string }

export async function saveScript(id: string, s: ScriptEdit): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  if (!s.script.trim()) return { error: "The script is empty." };
  const supabase = await createClient("team");
  const tags = s.hashtags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)).slice(0, 14);
  const { error } = await supabase.from("studio_items").update({ title: s.title.trim().slice(0, 120) || "Untitled", hook: s.hook.trim() || null, script: s.script.trim(), caption: s.caption.trim() || null, hashtags: tags }).eq("id", id).in("status", ["draft", "failed", "generated"]);
  return done(error);
}

/** "Request a change": the scriptwriter rewrites from your note (free). */
export async function requestChange(id: string, note: string): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  const n = note.trim();
  if (n.length < 3) return { error: "Say what should change." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("studio_items").update({ status: "drafting" }).eq("id", id).in("status", ["draft", "failed"]);
  if (error) return done(error);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient("system").from("agent_tasks").insert({ kind: "studio_script", payload: { item_id: id, note: n.slice(0, 600) } });
  after(runRouting);
  return done();
}

/** The one gate: approving a script starts its render (one of the month's renders). */
export async function approveItem(id: string): Promise<Result> {
  const viewer = await requireSection("sales_marketing", ROLES);
  const u = await usageThisMonth();
  if (u.used >= u.allowance) return { error: `This month's ${u.allowance} renders are used. Prashanth can raise the allowance in the policy book (Content Studio rules).` };
  const supabase = await createClient("team");
  const { data: item } = await supabase.from("studio_items").select("status, script").eq("id", id).maybeSingle();
  if (!item) return { error: "Not found." };
  if (!item.script) return { error: "There's no script yet." };
  const regen = item.status === "generated" || item.status === "failed";
  if (!["draft", "generated", "failed"].includes(item.status as string)) return { error: "This one is already rendering." };
  const { error } = await supabase.from("studio_items").update({ status: "approved", approved_by: viewer.userId, approved_at: new Date().toISOString(), error: null, progress: { stage: "queued" } }).eq("id", id);
  if (error) return done(error);
  await supabase.from("studio_usage").insert({ item_id: id, kind: regen ? "regeneration" : "generation", by_user: viewer.userId });
  after(() => kickMediaWorker());
  return done();
}

export async function discardItem(id: string): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  const supabase = await createClient("team");
  const { error } = await supabase.from("studio_items").update({ status: "discarded" }).eq("id", id).in("status", ["draft", "drafting", "failed", "generated"]);
  return done(error);
}

export async function restoreItem(id: string): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  const supabase = await createClient("team");
  const { error } = await supabase.from("studio_items").update({ status: "draft" }).eq("id", id).eq("status", "discarded");
  return done(error);
}

/** Edit one finished slide's words or picture; it's set again in seconds (free, a few times per slide). */
export async function editSlide(itemId: string, idx: number, e: { headline: string; support: string; kicker: string; assetId: string | null }): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  const supabase = await createClient("team");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient("system");
  const { data: r } = await admin.from("studio_renders").select("id, spec, edits, source_url, status").eq("item_id", itemId).eq("kind", "slide").eq("idx", idx).maybeSingle();
  if (!r) return { error: "Slide not found." };
  const limit = (await book()).get("studio.content").slide_edits_per_slide;
  if (Number(r.edits) >= limit) return { error: `This slide has had its ${limit} edits. Regenerate the post to start again.` };
  if (!e.headline.trim()) return { error: "The headline is empty." };
  let source = r.source_url as string | null;
  if (e.assetId !== null) {
    if (e.assetId) {
      const { data: a } = await supabase.from("media_assets").select("url, kind").eq("id", e.assetId).maybeSingle();
      if (!a || a.kind !== "image") return { error: "Choose a photo." };
      source = a.url as string;
    } else source = null;
  }
  const spec: Record<string, unknown> = { ...(r.spec as Record<string, unknown>), headline: e.headline.trim().slice(0, 90), support: e.support.trim().slice(0, 200) || null, kicker: e.kicker.trim().slice(0, 40) || null };
  if (e.assetId !== null) { spec.asset_id = e.assetId || null; delete spec.bg_url; spec.layout = source ? ((spec.layout as string) === "type" ? "photo" : spec.layout) : "type"; }
  const { error } = await admin.from("studio_renders").update({ spec, source_url: source, status: "queued", edits: Number(r.edits) + 1 }).eq("id", r.id);
  if (error) return done(error);
  await admin.from("studio_items").update({ status: "generating" }).eq("id", itemId).in("status", ["generated", "failed"]);
  await admin.from("studio_usage").insert({ item_id: itemId, kind: "slide_edit" });
  after(() => kickMediaWorker());
  return done();
}

export interface NewPlan { start: string; weeks: string; postsPerWeek: string; reel: string; carousel: string; single: string; pillars: string[]; notes: string }

/** Plan a week or four: the strategist fills every slot, the scriptwriter writes each. */
export async function createPlan(p: NewPlan): Promise<Result> {
  const viewer = await requireSection("sales_marketing", ROLES);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start)) return { error: "Choose a start date." };
  const weeks = p.weeks === "4" ? 4 : 1;
  const end = new Date(new Date(`${p.start}T00:00:00Z`).getTime() + (weeks * 7 - 1) * 86_400_000).toISOString().slice(0, 10);
  const mix = { reel: Math.max(0, Number(p.reel) || 0), carousel: Math.max(0, Number(p.carousel) || 0), single_post: Math.max(0, Number(p.single) || 0) };
  if (mix.reel + mix.carousel + mix.single_post === 0) return { error: "Give the format mix some weight." };
  const supabase = await createClient("team");
  const { data, error } = await supabase.from("studio_plans").insert({
    start_on: p.start, end_on: end, posts_per_week: Math.max(1, Math.min(7, Number(p.postsPerWeek) || 3)), mix, pillars: p.pillars.slice(0, 10), notes: p.notes.trim() || null, status: "planning", created_by: viewer.userId,
  }).select("id").single();
  if (error) return done(error);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient("system").from("agent_tasks").insert({ kind: "studio_plan", payload: { plan_id: data.id } });
  after(runRouting);
  return done(null, data.id as string);
}

export interface BrandEdit { fields: Record<string, string>; logoUrl: string; logoLightUrl: string; markUrl: string }
const TEXT_FIELDS = ["brand_name", "tagline", "description", "positioning", "voice", "audience", "writing_style", "caption_format", "voiceover", "visual_style", "photography", "hashtag_rule", "handle"];
const LIST_FIELDS = ["pain_points", "differentiators", "pillars", "dos", "donts", "hashtags", "ctas"];

/** The brand profile every script reads. Lists are one item per line. */
export async function saveBrand(b: BrandEdit): Promise<Result> {
  const viewer = await requireSection("sales_marketing", ROLES);
  const supabase = await createClient("team");
  const { data: cur } = await supabase.from("studio_brand").select("profile").eq("id", 1).maybeSingle();
  const profile = { ...((cur?.profile ?? {}) as Record<string, unknown>) };
  for (const k of TEXT_FIELDS) if (k in b.fields) profile[k] = b.fields[k]!.trim().slice(0, 3000);
  for (const k of LIST_FIELDS) if (k in b.fields) profile[k] = b.fields[k]!.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
  const url = (u: string) => (/^https:\/\/\S+$/.test(u.trim()) ? u.trim() : null);
  const { error } = await supabase.from("studio_brand").update({ profile, logo_url: url(b.logoUrl), logo_light_url: url(b.logoLightUrl), mark_url: url(b.markUrl), updated_by: viewer.userId }).eq("id", 1);
  return done(error);
}

/** Nudge the worker (renders also continue on their own). */
export async function checkRenders(): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  after(() => kickMediaWorker());
  return done();
}

/** The studio is taking too long (or is switched off): write the script yourself. */
export async function writeMyself(id: string): Promise<Result> {
  await requireSection("sales_marketing", ROLES);
  const supabase = await createClient("team");
  const { error } = await supabase.from("studio_items").update({ status: "draft" }).eq("id", id).eq("status", "drafting");
  return done(error);
}
