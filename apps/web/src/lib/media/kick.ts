import "server-only";
import { env } from "../env";
import { createAdminClient } from "../supabase/admin";

/**
 * Ask the media worker to run now (a separate request with its own time
 * budget). Fire-and-forget: the 15-minute tick picks up anything missed.
 */
export async function kickMediaWorker(hop = 0): Promise<void> {
  const secret = env.cronSecret();
  if (!secret || hop > 25) return;
  try {
    await fetch(`${env.appUrl().replace(/\/$/, "")}/api/media/work`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "x-media-hop": String(hop) },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // The worker keeps running after we stop waiting; a failed kick is retried by the tick.
  }
}

/** Kick only when there's something to do (queued slides, approved or rendering studio items). */
export async function kickIfMediaWork(): Promise<void> {
  const admin = createAdminClient("system");
  const [{ count: slides }, { count: items }] = await Promise.all([
    admin.from("moodboard_slides").select("id", { count: "exact", head: true }).eq("status", "queued"),
    admin.from("studio_items").select("id", { count: "exact", head: true }).in("status", ["approved", "generating"]),
  ]);
  if ((slides ?? 0) + (items ?? 0) > 0) await kickMediaWorker();
}
