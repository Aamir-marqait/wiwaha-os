import "server-only";
import { createFal, type FalAdapter } from "@wiwaha/integrations";
import { env } from "../env";
import { createAdminClient } from "../supabase/admin";
import { type MediaPrices, parsePrices } from "./costs";

/**
 * The media worker's settings (D41): one FAL_KEY for pictures, voice, music and
 * clips; the endpoints live in agents.config (Settings → Agents) like the Claude
 * models do. Without the key everything still works offline: real photos with
 * our typography, silent reels with captions, template moodboard pictures.
 */

export const MEDIA_BUCKET = "media";

export interface MediaModels {
  image: string;
  image_edit: string;
  tts: string;
  voice: string;
  music: string;
  image_to_video: string;
}

let falCache: FalAdapter | null = null;
export function fal(): FalAdapter {
  return (falCache ??= createFal({ FAL_KEY: process.env.FAL_KEY }));
}

/** What each endpoint costs, kept next to the models (D42). */
export async function mediaPrices(agentKey: "design" | "content_studio"): Promise<MediaPrices> {
  const { data } = await createAdminClient("agent").from("agents").select("config").eq("key", agentKey).maybeSingle();
  return parsePrices((data?.config as { media_prices?: unknown } | null)?.media_prices);
}

export async function mediaModels(agentKey: "design" | "content_studio"): Promise<Partial<MediaModels>> {
  const { data } = await createAdminClient("agent").from("agents").select("config").eq("key", agentKey).maybeSingle();
  const cfg = (data?.config ?? {}) as { media_models?: Partial<MediaModels> };
  return cfg.media_models ?? {};
}

export function requireModel(models: Partial<MediaModels>, key: keyof MediaModels): string {
  const m = models[key];
  if (!m) throw new Error(`No fal model set for "${key}". Add it under Settings → Agents.`);
  return m;
}

/** fal calls this when a job finishes; the secret proves the call is for us (fal also signs it). */
export function falWebhookUrl(): string | undefined {
  const base = env.appUrl();
  if (!/^https:\/\//.test(base)) return undefined; // fal can't reach localhost; the sweep polls instead
  return `${base.replace(/\/$/, "")}/api/webhooks/fal?k=${encodeURIComponent(process.env.WEBHOOK_SECRET ?? "")}`;
}
