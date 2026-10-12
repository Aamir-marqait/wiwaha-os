import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Feeds are read by Google Calendar or iCloud without a login, so each URL carries a signature. */
function key(): string {
  return process.env.CALENDAR_FEED_SECRET || env.serviceRoleKey();
}

export function feedSig(scope: string): string {
  return createHmac("sha256", key()).update(`calendar-feed:${scope}`).digest("base64url").slice(0, 32);
}

export function feedSigOk(scope: string, sig: string | null): boolean {
  if (!sig) return false;
  const want = Buffer.from(feedSig(scope));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** https URL to paste into Google Calendar ("From URL") or iCloud ("New calendar subscription"). */
export function feedUrl(scope: string): string {
  return `${env.appUrl()}/api/calendar/feed?scope=${encodeURIComponent(scope)}&sig=${feedSig(scope)}`;
}
