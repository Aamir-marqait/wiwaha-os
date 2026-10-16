import { after, NextResponse, type NextRequest } from "next/server";
import { runRouting } from "@/lib/agents";
import { isAuthorisedCron } from "@/lib/cron";
import { kickMediaWorker } from "@/lib/media/kick";
import { runMediaWork } from "@/lib/media/worker";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The media worker (D40, D41): moodboard pictures, studio slides, reel shots
 * and assembly. Called by webhooks, actions and the tick; runs within its
 * budget, routes any work it produced (e.g. "moodboard rendered"), and calls
 * itself again while there's more.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const hop = Number(req.headers.get("x-media-hop") ?? 0) || 0;
  const report = await runMediaWork(240_000);
  after(async () => {
    await runRouting();
    if (report.more) await kickMediaWorker(hop + 1);
  });
  return NextResponse.json(report);
}
export const GET = POST;
