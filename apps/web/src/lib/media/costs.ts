/**
 * What a fal job should cost (D42), from the prices kept with the models in
 * agents.config.media_prices. An estimate: fal bills the account; this lets us
 * see spend per wedding and per post, and warn before the budget runs out.
 */

export type PriceUnit = "image" | "1k_chars" | "audio_minute" | "second";
export interface MediaPrice { per: PriceUnit; usd: number }
export type MediaPrices = Record<string, MediaPrice>;

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);

export function parsePrices(v: unknown): MediaPrices {
  const out: MediaPrices = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
    if (!p || typeof p !== "object") continue;
    const per = (p as { per?: unknown }).per;
    const usd = (p as { usd?: unknown }).usd;
    if ((per === "image" || per === "1k_chars" || per === "audio_minute" || per === "second") && typeof usd === "number" && usd >= 0) out[k] = { per, usd };
  }
  return out;
}

/** USD for one request, or null when we don't know the endpoint's price. */
export function estimateCostUsd(endpoint: string, input: Record<string, unknown>, prices: MediaPrices): number | null {
  const p = prices[endpoint];
  if (!p) return null;
  let units: number;
  switch (p.per) {
    case "image": {
      const n = Math.max(1, Math.round(num(input.num_images, 1)));
      const res = String(input.resolution ?? "").toUpperCase();
      units = n * (res === "4K" ? 2 : 1);
      break;
    }
    case "1k_chars":
      units = String(input.text ?? input.prompt ?? "").length / 1000;
      break;
    case "audio_minute":
      // Billed by the started minute.
      units = Math.max(1, Math.ceil(num(input.music_length_ms, 60_000) / 60_000));
      break;
    case "second":
      units = Math.max(1, num(input.duration, 5));
      break;
  }
  return Math.round(p.usd * units * 10_000) / 10_000;
}

export const usdToPaise = (usd: number, inrPerUsd: number): number => Math.round(usd * inrPerUsd * 100);
