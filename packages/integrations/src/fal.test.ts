import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFal, falAudioUrl, falImageUrl, falVideoUrl, falWords, FalQueue, verifyFalWebhook, type FalFetch } from "./fal";

describe("fal queue", () => {
  it("submits with our webhook and keeps fal's status and result URLs", async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string>; body?: string } }[] = [];
    const fetchFn: FalFetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => JSON.stringify({ request_id: "req_1", status_url: "https://queue.fal.run/fal-ai/nano-banana-pro/requests/req_1/status", response_url: "https://queue.fal.run/fal-ai/nano-banana-pro/requests/req_1" }) };
    };
    const fal = new FalQueue("k_test", fetchFn);
    const s = await fal.submit("fal-ai/nano-banana-pro/edit", { prompt: "p", image_urls: ["https://x.test/a.jpg"] }, "https://app.test/api/webhooks/fal?k=s");
    expect(calls[0]!.url).toBe("https://queue.fal.run/fal-ai/nano-banana-pro/edit?fal_webhook=https%3A%2F%2Fapp.test%2Fapi%2Fwebhooks%2Ffal%3Fk%3Ds");
    expect(calls[0]!.init.headers.Authorization).toBe("Key k_test");
    expect(s).toEqual({ requestId: "req_1", statusUrl: "https://queue.fal.run/fal-ai/nano-banana-pro/requests/req_1/status", responseUrl: "https://queue.fal.run/fal-ai/nano-banana-pro/requests/req_1" });
  });

  it("never sends the key anywhere but fal", async () => {
    const fal = new FalQueue("k_test", async () => ({ ok: true, status: 200, text: async () => "{}" }));
    await expect(fal.result("https://evil.test/steal")).rejects.toThrow("Not a fal URL");
    await expect(fal.submit("../x", {})).rejects.toThrow("Bad fal endpoint");
  });

  it("is a sandbox without a key", async () => {
    const fal = createFal({});
    expect(fal.live).toBe(false);
    await expect(fal.submit("fal-ai/x/y", {})).rejects.toThrow("FAL_KEY is not set");
  });
});

describe("reading outputs", () => {
  it("finds the file in each model's shape", () => {
    expect(falImageUrl({ images: [{ url: "https://f.test/i.png" }] })).toBe("https://f.test/i.png");
    expect(falVideoUrl({ video: { url: "https://f.test/v.mp4" } })).toBe("https://f.test/v.mp4");
    expect(falAudioUrl({ audio: { url: "https://f.test/a.mp3" } })).toBe("https://f.test/a.mp3");
    expect(falImageUrl({})).toBeNull();
  });

  it("reads word timings and drops voice tags", () => {
    expect(falWords({ timestamps: [{ text: "[warmly]", start: 0, end: 0.1 }, { text: "Your", start: 0.1, end: 0.3 }, { word: "wedding,", start: 0.3, end: 0.7 }] }).map((w) => w.text)).toEqual(["Your", "wedding,"]);
    const chars = "[softly] Hi there".split("");
    const w = falWords({ alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10), character_end_times_seconds: chars.map((_, i) => i / 10 + 0.1) } });
    expect(w.map((x) => x.text)).toEqual(["Hi", "there"]);
    expect(w[0]!.start).toBeCloseTo(0.9);
  });
});

describe("webhook signatures", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  const body = JSON.stringify({ request_id: "r1", status: "OK", payload: {} });
  const now = 1_800_000_000;
  const msg = (ts: number) => Buffer.from(["r1", "u1", String(ts), createHash("sha256").update(body).digest("hex")].join("\n"));
  const sig = (ts: number) => sign(null, msg(ts), privateKey).toString("hex");

  it("accepts fal's signature", () => {
    expect(verifyFalWebhook({ requestId: "r1", userId: "u1", timestamp: String(now), signature: sig(now) }, body, [{ x: jwk.x }], now)).toBe(true);
  });
  it("rejects tampering, old timestamps and missing headers", () => {
    expect(verifyFalWebhook({ requestId: "r1", userId: "u1", timestamp: String(now), signature: sig(now) }, `${body} `, [{ x: jwk.x }], now)).toBe(false);
    expect(verifyFalWebhook({ requestId: "r1", userId: "u1", timestamp: String(now - 600), signature: sig(now - 600) }, body, [{ x: jwk.x }], now)).toBe(false);
    expect(verifyFalWebhook({ requestId: null, userId: "u1", timestamp: String(now), signature: sig(now) }, body, [{ x: jwk.x }], now)).toBe(false);
  });
});
