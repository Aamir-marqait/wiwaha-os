import { NextResponse, type NextRequest } from "next/server";
import { runMorningBrief } from "@/lib/agents";
import { isAuthorisedCron } from "@/lib/cron";

export const maxDuration = 300;

/** 03:00 UTC = 08:30 IST (vercel.json). The Chief of Staff writes Prashanth's brief. */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const out = await runMorningBrief();
  return NextResponse.json({ status: out.status, ...(out.status === "done" ? { brief_id: out.result.briefId, headline: out.result.headlineSource } : {}), ...(out.status === "error" ? { error: out.error } : {}) });
}
