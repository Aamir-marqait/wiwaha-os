import "server-only";
import type { NextRequest } from "next/server";
import { env } from "./env";

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Reject everything else. */
export function isAuthorisedCron(req: NextRequest): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
