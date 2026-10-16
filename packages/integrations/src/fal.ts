import { createHash, createPublicKey, verify } from "node:crypto";

/**
 * fal.ai: images, image edits, voice, music and short clips, all on one
 * FAL_KEY (D41). Work goes through fal's queue so no request waits on a model:
 * we submit, fal calls our webhook when it is done, and the 15-minute sweep
 * polls anything whose webhook never arrived. Without a key the adapter is a
 * sandbox and callers use their offline fallbacks.
 */

export type FalFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface FalSubmitted {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export type FalQueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";

export interface FalStatus {
  status: FalQueueStatus;
  error: string | null;
}

export interface FalAdapter {
  readonly provider: "fal" | "sandbox";
  readonly live: boolean;
  /** Queue a request; fal POSTs the result to `webhookUrl` when it finishes. */
  submit(endpoint: string, input: Record<string, unknown>, webhookUrl?: string): Promise<FalSubmitted>;
  status(statusUrl: string): Promise<FalStatus>;
  /** The model's output once COMPLETED (throws if fal reports an error). */
  result(responseUrl: string): Promise<Record<string, unknown>>;
}

export class FalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FalError";
  }
}

const QUEUE = "https://queue.fal.run";

function parse(text: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function detail(json: Record<string, unknown>, text: string): string {
  const d = json.detail ?? json.error ?? json.message;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x && typeof x === "object" && "msg" in x ? String((x as { msg: unknown }).msg) : JSON.stringify(x))).join("; ");
  return text.slice(0, 300);
}

/** Only fal's own queue URLs are ever fetched with our key. */
function assertFalUrl(url: string): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new FalError("Not a fal URL", 400); }
  if (u.protocol !== "https:" || !(u.hostname === "queue.fal.run" || u.hostname.endsWith(".fal.run") || u.hostname.endsWith(".fal.ai"))) {
    throw new FalError("Not a fal URL", 400);
  }
}

export class FalQueue implements FalAdapter {
  readonly provider = "fal" as const;
  readonly live = true;
  constructor(private readonly key: string, private readonly fetchFn: FalFetch) {}

  private headers(): Record<string, string> {
    return { Authorization: `Key ${this.key}`, "Content-Type": "application/json", Accept: "application/json" };
  }

  async submit(endpoint: string, input: Record<string, unknown>, webhookUrl?: string): Promise<FalSubmitted> {
    if (!/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)+$/i.test(endpoint)) throw new FalError(`Bad fal endpoint "${endpoint}"`, 400);
    const url = `${QUEUE}/${endpoint}${webhookUrl ? `?fal_webhook=${encodeURIComponent(webhookUrl)}` : ""}`;
    const res = await this.fetchFn(url, { method: "POST", headers: this.headers(), body: JSON.stringify(input) });
    const text = await res.text();
    const json = parse(text);
    if (!res.ok) throw new FalError(`fal refused the request (${res.status}): ${detail(json, text)}`, res.status);
    const requestId = typeof json.request_id === "string" ? json.request_id : null;
    if (!requestId) throw new FalError("fal did not return a request id", 502);
    const base = `${QUEUE}/${endpoint}/requests/${requestId}`;
    return {
      requestId,
      statusUrl: typeof json.status_url === "string" ? json.status_url : `${base}/status`,
      responseUrl: typeof json.response_url === "string" ? json.response_url : base,
    };
  }

  async status(statusUrl: string): Promise<FalStatus> {
    assertFalUrl(statusUrl);
    const res = await this.fetchFn(statusUrl, { method: "GET", headers: this.headers() });
    const text = await res.text();
    const json = parse(text);
    if (!res.ok && res.status !== 202) throw new FalError(`fal status failed (${res.status}): ${detail(json, text)}`, res.status);
    const s = json.status;
    const status: FalQueueStatus = s === "COMPLETED" || s === "IN_PROGRESS" ? s : "IN_QUEUE";
    return { status, error: typeof json.error === "string" ? json.error : null };
  }

  async result(responseUrl: string): Promise<Record<string, unknown>> {
    assertFalUrl(responseUrl);
    const res = await this.fetchFn(responseUrl, { method: "GET", headers: this.headers() });
    const text = await res.text();
    const json = parse(text);
    if (!res.ok) throw new FalError(`fal result failed (${res.status}): ${detail(json, text)}`, res.status);
    return json;
  }
}

export class FalSandbox implements FalAdapter {
  readonly provider = "sandbox" as const;
  readonly live = false;
  async submit(): Promise<FalSubmitted> {
    throw new FalError("FAL_KEY is not set: images, voice and clips use the offline fallbacks", 503);
  }
  async status(): Promise<FalStatus> {
    return { status: "COMPLETED", error: "sandbox" };
  }
  async result(): Promise<Record<string, unknown>> {
    throw new FalError("FAL_KEY is not set", 503);
  }
}

export function createFal(env: { FAL_KEY?: string | undefined }, fetchFn: FalFetch = fetch as unknown as FalFetch): FalAdapter {
  const key = env.FAL_KEY?.trim();
  return key ? new FalQueue(key, fetchFn) : new FalSandbox();
}

// ---------------------------------------------------------------------------
// Reading model outputs. Every fal model names its file differently.
// ---------------------------------------------------------------------------

function fileUrl(v: unknown): string | null {
  if (v && typeof v === "object" && "url" in v && typeof (v as { url: unknown }).url === "string") return (v as { url: string }).url;
  return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
}

/** First image URL in an image model's output ({images:[{url}]} or {image:{url}}). */
export function falImageUrl(out: Record<string, unknown>): string | null {
  const images = out.images;
  if (Array.isArray(images)) for (const i of images) { const u = fileUrl(i); if (u) return u; }
  return fileUrl(out.image);
}

/** {video:{url}} from video models. */
export function falVideoUrl(out: Record<string, unknown>): string | null {
  return fileUrl(out.video) ?? (typeof out.video_url === "string" ? out.video_url : null);
}

/** {audio:{url}} from voice and music models. */
export function falAudioUrl(out: Record<string, unknown>): string | null {
  return fileUrl(out.audio) ?? fileUrl(out.audio_file) ?? (typeof out.audio_url === "string" ? out.audio_url : null);
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/**
 * Per-word timings from ElevenLabs on fal. Accepts the shapes fal has used:
 * [{text|word, start, end}] or ElevenLabs' character alignment
 * {characters[], character_start_times_seconds[], character_end_times_seconds[]}.
 * Voice-direction tags like [warmly] are dropped so they never reach captions.
 */
export function falWords(out: Record<string, unknown>): TimedWord[] {
  const raw = out.timestamps ?? out.words ?? out.alignment ?? out.normalized_alignment;
  const words: TimedWord[] = [];
  const push = (text: string, start: number, end: number) => {
    const clean = text.replace(/\[[^\]]*\]/g, "").trim();
    if (clean && Number.isFinite(start) && Number.isFinite(end)) words.push({ text: clean, start, end: Math.max(end, start + 0.05) });
  };
  if (Array.isArray(raw)) {
    for (const w of raw) {
      if (!w || typeof w !== "object") continue;
      const o = w as Record<string, unknown>;
      const text = typeof o.text === "string" ? o.text : typeof o.word === "string" ? o.word : "";
      push(text, Number(o.start ?? o.start_time ?? o.start_s), Number(o.end ?? o.end_time ?? o.end_s));
    }
    return mergeTagFragments(words);
  }
  if (raw && typeof raw === "object") {
    const a = raw as Record<string, unknown>;
    const chars = a.characters, starts = a.character_start_times_seconds, ends = a.character_end_times_seconds;
    if (Array.isArray(chars) && Array.isArray(starts) && Array.isArray(ends)) {
      let buf = "", s = 0, e = 0, inTag = false;
      for (let i = 0; i < chars.length; i++) {
        const c = String(chars[i]);
        if (c === "[") { inTag = true; continue; }
        if (c === "]") { inTag = false; continue; }
        if (inTag) continue;
        if (/\s/.test(c)) {
          if (buf) push(buf, s, e);
          buf = "";
          continue;
        }
        if (!buf) s = Number(starts[i]);
        buf += c;
        e = Number(ends[i]);
      }
      if (buf) push(buf, s, e);
    }
  }
  return words;
}

function mergeTagFragments(words: TimedWord[]): TimedWord[] {
  return words.filter((w) => !/^[[\]]+$/.test(w.text));
}

// ---------------------------------------------------------------------------
// Webhook signatures (ED25519, keys from fal's JWKS).
// ---------------------------------------------------------------------------

export interface FalJwk { kty?: string; crv?: string; x: string; kid?: string }

export const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";

/**
 * True when the body was signed by fal. `nowSeconds` is injectable for tests.
 * Message = request id \n user id \n timestamp \n sha256(body) hex.
 */
export function verifyFalWebhook(
  headers: { requestId: string | null; userId: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  keys: readonly FalJwk[],
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { requestId, userId, timestamp, signature } = headers;
  if (!requestId || !userId || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const digest = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const message = Buffer.from([requestId, userId, timestamp, digest].join("\n"), "utf8");
  let sig: Buffer;
  try { sig = Buffer.from(signature, "hex"); } catch { return false; }
  if (sig.length !== 64) return false;
  for (const k of keys) {
    try {
      const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" });
      if (verify(null, message, key, sig)) return true;
    } catch {
      // a malformed key in the set: try the next one
    }
  }
  return false;
}
