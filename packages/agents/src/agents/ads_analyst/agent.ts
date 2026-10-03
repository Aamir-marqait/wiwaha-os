import type { Json } from "@wiwaha/db";
import { addDays, rupees } from "@wiwaha/db";
import { where } from "../../framework/db";
import { agentDb, claimRun, istDate, istInstant, istWeekday, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { ADS_GATE } from "./gate";
import { ADS_TOOLS } from "./tools";

export const ADS_ANALYST = "ads_analyst";

/** Which lead sources each ad platform produces. */
const PLATFORM_SOURCES: Record<string, string[]> = { meta: ["instagram", "facebook", "meta_form"], google: ["google_ads", "google_form"] };

export interface SourceRow { platform: string; spendPaise: number; enquiries: number; bookings: number; cpePaise: number | null; cpbPaise: number | null }

export function analyse(spend: { platform: string; spend_paise: number }[], leads: { id: string; source: string }[], bookedLeadIds: Set<string>, platforms: string[]): SourceRow[] {
  return platforms.map((platform) => {
    const sources = PLATFORM_SOURCES[platform] ?? [];
    const s = spend.filter((x) => x.platform === platform).reduce((a, x) => a + x.spend_paise, 0);
    const ls = leads.filter((l) => sources.includes(l.source));
    const b = ls.filter((l) => bookedLeadIds.has(l.id)).length;
    return { platform, spendPaise: s, enquiries: ls.length, bookings: b, cpePaise: ls.length ? Math.round(s / ls.length) : null, cpbPaise: b ? Math.round(s / b) : null };
  });
}

export function recommend(rows: SourceRow[]): string {
  const withData = rows.filter((r) => r.spendPaise > 0);
  if (withData.length === 0) return "No ad spend recorded this week. Import Meta and Google spend (Marketing → Ads) to get a recommendation.";
  if (withData.every((r) => r.enquiries < 3)) return "Too few enquiries to judge yet. Keep budgets as they are for another week.";
  const ranked = [...withData].sort((a, b) => (a.cpePaise ?? Infinity) - (b.cpePaise ?? Infinity));
  const best = ranked[0]!, worst = ranked.at(-1)!;
  if (best === worst) return `Only ${best.platform} is running. Keep the budget steady; consider a small test on the other platform.`;
  return `${best.platform} brings enquiries at ${rupees(best.cpePaise)} each against ${rupees(worst.cpePaise)} on ${worst.platform}. Recommendation: move about 15% of next week's ${worst.platform} budget to ${best.platform}${best.bookings ? ` (it also produced ${best.bookings} booking${best.bookings > 1 ? "s" : ""})` : ""}.`;
}

/** Weekly on the policy's report day: spend, cost per enquiry and per booking, and a budget recommendation for Prashanth. */
export async function weeklyAdsReport(deps: AgentDeps): Promise<RunOutcome<{ approvalId: string | null; skipped?: string }>> {
  return runAgent(deps, ADS_ANALYST, { action: "weekly_ads_report", input: {}, fallbackTitle: "Weekly ads report" }, async (ctx) => {
    const db = agentDb(ctx, ADS_TOOLS);
    const rules = ctx.book.get("ads.reporting");
    if (istWeekday(ctx.now) !== rules.report_day) return { approvalId: null, skipped: `report day is ${rules.report_day}` };
    const today = istDate(ctx.now);
    if (!(await claimRun(db, "ads_week", today))) return { approvalId: null, skipped: "already reported" };
    const from = addDays(today, -7);
    const spend = await db.select<{ platform: string; spend_paise: number }>("ad_spend", { where: { day: where.gte(from), platform: where.in(rules.platforms) } });
    const all = await db.select<{ id: string; source: string; first_touch_at: string }>("leads", { where: { first_touch_at: where.gte(istInstant(from, "00:00")) } });
    const leads = all.filter((l) => l.first_touch_at < istInstant(today, "00:00"));
    const booked = await db.select<{ lead_id: string | null }>("weddings", { where: { booked_on: where.gte(from) } });
    const rows = analyse(spend, leads, new Set(booked.map((b) => b.lead_id).filter((x): x is string => !!x)), rules.platforms);
    const rec = recommend(rows);
    const body = [
      `Ads report: ${from} to ${addDays(today, -1)}`,
      ...rows.map((r) => `${r.platform}: spend ${rupees(r.spendPaise)} · ${r.enquiries} enquiries (${r.cpePaise === null ? "—" : rupees(r.cpePaise)} each) · ${r.bookings} bookings (${r.cpbPaise === null ? "—" : rupees(r.cpbPaise)} each)`),
      "",
      rec,
      "",
      "Approving records your decision; budgets are changed by hand in Meta Ads Manager and Google Ads.",
    ].join("\n");
    const approvalId = await requestApproval(ctx, { kind: ADS_GATE.approval, title: `Ads report and budget recommendation (week to ${addDays(today, -1)})`, summary: rec.slice(0, 160), payload: { body, rows: rows as unknown as Json } });
    await ctx.log({ action: "weekly_ads_report", status: "gated", input: { from, to: today }, output: { rows: rows as unknown as Json, recommendation: rec }, policyKeys: ["ads.reporting"], policyVersions: ctx.book.versions(["ads.reporting"]) });
    return { approvalId };
  });
}
