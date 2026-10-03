import type { Json } from "@wiwaha/db";
import { routeTasks } from "./agents/chief_of_staff/agent";
import { placeFollowUpCalls } from "./agents/voice_concierge/agent";
import { sendVisitReminders } from "./agents/visit_host/agent";
import { sendPaymentReminders } from "./agents/contract_payments/agent";
import { lockPlateCounts } from "./agents/menu/agent";
import { chaseVendors } from "./agents/vendor_coordinator/agent";
import { nudgeStages } from "./agents/wedding_room/agent";
import { anniversaryWishes, sendOffboardingSteps } from "./agents/offboarding/agent";
import { draftWeek } from "./agents/content_studio/agent";
import { weeklyAdsReport } from "./agents/ads_analyst/agent";
import { estateSweep } from "./agents/estate/agent";
import { reconcilePayments, startCloseOuts } from "./agents/finance/agent";
import { escalateOverdue, eveningReview, morningStandup } from "./agents/standup/agent";
import { createDispatcher } from "./dispatch";
import { sendApprovedMessages } from "./framework/kit";
import type { RunOutcome } from "./framework/runner";
import type { AgentDeps } from "./framework/types";

/**
 * The scheduler's tick (every 15 minutes, from pg_cron or Vercel Cron).
 * Every job is idempotent: running the tick twice never sends anything twice.
 */
export type ScheduledJob = { name: string; run: (deps: AgentDeps) => Promise<RunOutcome<unknown> | unknown> };

const JOBS: ScheduledJob[] = [
  { name: "route_tasks", run: (d) => routeTasks(d, createDispatcher(d)) },
  { name: "follow_up_calls", run: placeFollowUpCalls },
  { name: "visit_reminders", run: sendVisitReminders },
  { name: "payment_reminders", run: sendPaymentReminders },
  { name: "vendor_chases", run: chaseVendors },
  { name: "plate_locks", run: lockPlateCounts },
  { name: "stage_nudges", run: nudgeStages },
  // Phase 4 (each is idempotent and checks its own time of day / weekday).
  { name: "morning_standup", run: morningStandup },
  { name: "evening_review", run: eveningReview },
  { name: "escalate_overdue", run: escalateOverdue },
  { name: "estate_sweep", run: estateSweep },
  { name: "close_outs", run: startCloseOuts },
  { name: "reconcile_payments", run: reconcilePayments },
  { name: "offboarding_steps", run: sendOffboardingSteps },
  { name: "anniversaries", run: anniversaryWishes },
  { name: "content_week", run: draftWeek },
  { name: "ads_report", run: weeklyAdsReport },
];

export function registerJob(job: ScheduledJob): void {
  if (!JOBS.some((j) => j.name === job.name)) JOBS.push(job);
}

export async function runTick(deps: AgentDeps): Promise<Record<string, Json>> {
  const out: Record<string, Json> = {};
  for (const job of JOBS) {
    try {
      const r = (await job.run(deps)) as { status?: string; result?: unknown; error?: string } | null;
      out[job.name] = (r && typeof r === "object" && "status" in r
        ? r.status === "done" ? r.result : { status: r.status ?? null, ...(r.error ? { error: r.error } : {}) }
        : r) as Json;
    } catch (err) {
      out[job.name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  // Last: anything approved (or sent above `draft`) goes out.
  out.send_approved = (await sendApprovedMessages(deps)) as unknown as Json;
  return out;
}
