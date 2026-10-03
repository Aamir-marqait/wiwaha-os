import { NextResponse, type NextRequest } from "next/server";
import { runScheduledTick } from "@/lib/agents";
import { isAuthorisedCron } from "@/lib/cron";

export const maxDuration = 300;

/**
 * The scheduler's tick (every 15 minutes from pg_cron, see decisions D23):
 * route agent work, follow-up calls, reminders, nudges, chases, briefs, and
 * send whatever has been approved. Every job is idempotent.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return NextResponse.json(await runScheduledTick());
}
export const POST = GET;
