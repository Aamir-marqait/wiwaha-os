import type { Json } from "@wiwaha/db";
import { addDays } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { where } from "../../framework/db";
import { agentDb, claimRun, istDate, istWeekday, requestApproval, writeText } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { CONTENT_GATE } from "./gate";
import { CONTENT_TOOLS } from "./tools";

export const CONTENT_STUDIO = "content_studio";
const POLICIES: readonly PolicyKey[] = ["content.rhythm", "venue.facts", "honesty.commitments", "discounts"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Platform = "instagram" | "facebook" | "youtube" | "linkedin" | "x";

const TAGS: Record<Platform, string[]> = {
  instagram: ["WiwahaByPraman", "BengaluruWeddings", "WeddingVenue", "IndianWedding"],
  facebook: ["WiwahaByPraman", "BengaluruWeddings"],
  youtube: ["WiwahaByPraman", "WeddingFilm"],
  linkedin: ["Weddings", "Hospitality"],
  x: ["BengaluruWeddings"],
};

/** Templates per theme, used offline and whenever the model's draft fails the guardrails. */
function template(theme: string, platform: Platform, v: { acres: number; km: number; rooms: number }, testimonial: string | null): string {
  const t = theme.toLowerCase();
  const text = t.includes("problem")
    ? `Worried about juggling caterers, décor and where everyone will stay? At Wiwaha, the venue, kitchen, décor team and ${v.rooms} guest rooms are all on one ${v.acres}-acre estate, so your family can simply celebrate. We've got this handled.`
    : t.includes("feature")
      ? `Just ${v.km} km from Bengaluru airport, our estate means relatives flying in are with you in minutes, not hours. Rooms on site, pickups arranged, and a planning portal that lets you set the pace.`
      : t.includes("testimonial")
        ? testimonial ? `"${testimonial}"\n\nWords from one of our couples. Thank you for letting us be part of your story.` : `Every celebration on the estate leaves us with a story. This week we're remembering a sunrise haldi under the banyan, and a family who danced until the very last song.`
        : t.includes("tip")
          ? `Planning tip: start your guest list for rooms around two months before the wedding. It gives your family time to plan travel, and gives us time to arrange airport pickups for everyone.`
          : `From a marigold haldi to a candlelit reception, every corner of our ${v.acres} acres can be dressed for your story. A glimpse from a recent celebration at Wiwaha.`;
  if (platform === "x") return text.length > 260 ? `${text.slice(0, 255).replace(/\s+\S*$/, "")}…` : text;
  if (platform === "youtube") return `${theme} | Wiwaha by Praman\n${text}`;
  if (platform === "linkedin") return `${text}\n\nWiwaha by Praman: weddings and celebrations near Bengaluru.`;
  return text;
}

/** The next Monday strictly after `today`. */
export function nextMonday(today: string, weekday: (typeof DAYS)[number]): string {
  return addDays(today, 7 - DAYS.indexOf(weekday));
}

/** Drafts next week's posts (one per platform per day) and puts each day in the approval queue. */
export async function draftWeek(deps: AgentDeps): Promise<RunOutcome<{ weekOf: string; posts: number; approvals: number }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "draft_week", input: {}, fallbackTitle: "Draft next week's posts" }, async (ctx) => {
    const db = agentDb(ctx, CONTENT_TOOLS);
    const rhythm = ctx.book.get("content.rhythm");
    const venue = ctx.book.get("venue.facts");
    const today = istDate(ctx.now);
    const weekOf = nextMonday(today, istWeekday(ctx.now));
    if (!(await claimRun(db, "content_week", weekOf))) return { weekOf, posts: 0, approvals: 0 };
    const quotes = (await db.select<{ testimonial: string | null }>("reviews", { where: { publish_consent: true, testimonial: where.notNull() }, order: [{ column: "submitted_at", ascending: false }], limit: 7 })).map((r) => r.testimonial!).filter(Boolean);
    let posts = 0, approvals = 0;
    for (const [i, day] of DAYS.entries()) {
      const date = addDays(weekOf, i);
      const theme = rhythm.weekly[day];
      const testimonial = theme.toLowerCase().includes("testimonial") ? quotes[0] ?? null : null;
      const ids: string[] = [];
      const preview: string[] = [];
      for (const platform of rhythm.platforms as Platform[]) {
        const tpl = template(theme, platform, { acres: venue.estate_acres, km: venue.airport_distance_km, rooms: venue.rooms_now }, testimonial);
        const text = await writeText(ctx, { policies: POLICIES, facts: { theme, platform, date, venue, testimonial }, task: `Write the ${platform} post for ${date} (theme: ${theme}).`, template: tpl, clientFacing: true, maxTokens: 400 });
        const caption = platform === "x" && text.body.length > 270 ? tpl : text.body;
        const [row] = await db.insert<{ id: string }>("content_posts", { scheduled_for: date, platform, theme, caption, hashtags: TAGS[platform], media_brief: `${theme}: estate photography in the sage, gold and ivory palette${testimonial ? "; pair with the couple's photo (consent on file)" : ""}.`, status: "pending_approval", created_by_agent: CONTENT_STUDIO });
        ids.push(row!.id);
        preview.push(`— ${platform} —\n${caption}\n${TAGS[platform].map((t) => `#${t}`).join(" ")}`);
        posts++;
      }
      const approvalId = await requestApproval(ctx, { kind: CONTENT_GATE.approval, title: `Posts for ${day[0]!.toUpperCase()}${day.slice(1)} ${date}: ${theme}`, summary: `${ids.length} platforms`, payload: { post_ids: ids, body: preview.join("\n\n") } });
      await db.update("content_posts", { id: where.in(ids) }, { approval_id: approvalId });
      approvals++;
    }
    await ctx.log({ action: "draft_week", status: "gated", input: { week_of: weekOf }, output: { posts, approvals } as Json, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { weekOf, posts, approvals };
  });
}

/** A day's posts decided: approved posts are scheduled for publishing (sandbox until the accounts are connected). */
export async function onPostsDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ scheduled: number }>> {
  return runAgent(deps, CONTENT_STUDIO, { action: "posts_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Schedule approved posts" }, async (ctx) => {
    const db = agentDb(ctx, CONTENT_TOOLS);
    const posts = await db.select<{ id: string; platform: string; caption: string; scheduled_for: string }>("content_posts", { where: { approval_id: approvalId } });
    if (status === "rejected") {
      await db.update("content_posts", { approval_id: approvalId }, { status: "rejected" });
      return { scheduled: 0 };
    }
    for (const p of posts) {
      await db.update("content_posts", { id: p.id }, { status: "scheduled" });
      await db.insert("outbox", { kind: "social_post", provider: "sandbox", to_address: p.platform, body: p.caption, status: "sandboxed", subject_table: "content_posts", subject_id: p.id, sent_at: ctx.now.toISOString() });
    }
    await ctx.log({ action: "posts_decided", status: "ok", input: { status }, output: { scheduled: posts.length } });
    return { scheduled: posts.length };
  });
}
