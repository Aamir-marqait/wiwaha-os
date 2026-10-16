import { NextResponse, type NextRequest } from "next/server";
import { runScheduledTick } from "@/lib/agents";
import { isAuthorisedCron } from "@/lib/cron";
import { runMediaWork } from "@/lib/media/worker";

export const maxDuration = 300;

/**
 * The scheduler's tick (every 15 minutes from pg_cron, see decisions D23):
 * route agent work, follow-up calls, reminders, nudges, chases, briefs, and
 * send whatever has been approved. Every job is idempotent.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const tick = await runScheduledTick();
  // Moodboard pictures and studio renders: finish anything a webhook missed.
  const media = await runMediaWork(90_000).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  return NextResponse.json({ ...tick, media });
}
export const POST = GET;
