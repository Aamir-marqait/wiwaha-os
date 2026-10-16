import { describe, expect, it } from "vitest";
import { estimateCostUsd, parsePrices, usdToPaise } from "./costs";

const prices = parsePrices({
  "fal-ai/nano-banana-pro/edit": { per: "image", usd: 0.15 },
  "fal-ai/elevenlabs/tts/eleven-v3": { per: "1k_chars", usd: 0.1 },
  "fal-ai/elevenlabs/music": { per: "audio_minute", usd: 0.6 },
  "minimax/h3-max/image-to-video": { per: "second", usd: 0.08 },
  broken: { per: "frame", usd: 1 },
});

describe("AI cost estimates", () => {
  it("prices pictures, 4K at double", () => {
    expect(estimateCostUsd("fal-ai/nano-banana-pro/edit", { num_images: 1, resolution: "1K" }, prices)).toBe(0.15);
    expect(estimateCostUsd("fal-ai/nano-banana-pro/edit", { num_images: 2, resolution: "4K" }, prices)).toBe(0.6);
  });
  it("prices voice by characters, music by the started minute, clips by the second", () => {
    expect(estimateCostUsd("fal-ai/elevenlabs/tts/eleven-v3", { text: "x".repeat(400) }, prices)).toBe(0.04);
    expect(estimateCostUsd("fal-ai/elevenlabs/music", { music_length_ms: 31_000 }, prices)).toBe(0.6);
    expect(estimateCostUsd("fal-ai/elevenlabs/music", { music_length_ms: 61_000 }, prices)).toBe(1.2);
    expect(estimateCostUsd("minimax/h3-max/image-to-video", { duration: 6 }, prices)).toBe(0.48);
  });
  it("ignores unknown endpoints and malformed prices", () => {
    expect(estimateCostUsd("someone/else", {}, prices)).toBeNull();
    expect(prices.broken).toBeUndefined();
  });
  it("converts to paise at the policy rate", () => {
    expect(usdToPaise(0.15, 88)).toBe(1320);
  });
});
