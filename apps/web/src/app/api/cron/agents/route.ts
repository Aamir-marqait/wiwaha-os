import { NextResponse, type NextRequest } from "next/server";
import { runRouting } from "@/lib/agents";
import { isAuthorisedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Hourly housekeeping: release expired holds (also done by pg_cron) and let
 * the Chief of Staff route queued agent work.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { data: released, error } = await createAdminClient("system").rpc("release_expired_holds");
  const routing = await runRouting();
  return NextResponse.json({ released: error ? null : released, release_error: error?.message ?? null, routing: routing.status === "done" ? routing.result : routing.status });
}
