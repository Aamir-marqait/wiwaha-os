/**
 * Pure helpers for the content studio (D41), ported from wiwaha-studio:
 * calendar slots and format mix (planning/planner.py), the carousel outline,
 * the spoken text of a reel, caption cues and the contact-number cue
 * (reels/captions.py), and the shot-plan repair (reels/planning.py).
 * No I/O here, so every rule is unit-tested.
 */

export type Format = "reel" | "carousel" | "single_post" | "story";

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** Posting-day preference within a week (0 = Monday): weekends and Wed/Fri carry the showcases. */
const DAY_PREFERENCE = [5, 4, 2, 0, 6, 3, 1];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const mondayIndex = (d: Date) => (d.getUTCDay() + 6) % 7;

/** Evenly place `postsPerWeek` posting days in every week of [start, end] (YYYY-MM-DD). */
export function buildSlots(start: string, end: string, postsPerWeek: number): string[] {
  const ppw = Math.max(1, Math.min(7, Math.round(postsPerWeek)));
  const chosen = new Set(DAY_PREFERENCE.slice(0, ppw));
  const out: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); isoDay(d) <= end; d = new Date(d.getTime() + 86_400_000)) {
    if (chosen.has(mondayIndex(d))) out.push(isoDay(d));
  }
  return out;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const weekdayOf = (day: string) => WEEKDAYS[mondayIndex(new Date(`${day}T00:00:00Z`))]!;

/** A percentage mix → an exact, interleaved sequence of formats of length n. */
export function allocateFormats(n: number, mix: Partial<Record<"reel" | "carousel" | "single_post", number>>): Format[] {
  const keys = (["reel", "carousel", "single_post"] as const).filter((k) => (mix[k] ?? 0) > 0);
  if (!keys.length || n <= 0) return Array.from({ length: Math.max(0, n) }, () => "carousel");
  const total = keys.reduce((s, k) => s + (mix[k] ?? 0), 0);
  const counts = Object.fromEntries(keys.map((k) => [k, Math.floor(((mix[k] ?? 0) * n) / total)])) as Record<string, number>;
  let remainder = n - Object.values(counts).reduce((a, b) => a + b, 0);
  for (const k of [...keys].sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))) {
    if (remainder <= 0) break;
    counts[k]!++;
    remainder--;
  }
  const remaining = { ...counts };
  const progress = Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  const out: Format[] = [];
  for (let i = 0; i < n; i++) {
    const best = keys.filter((k) => remaining[k]! > 0).reduce((a, b) => ((remaining[b]! / Math.max(1, counts[b]!)) - progress[b]! > (remaining[a]! / Math.max(1, counts[a]!)) - progress[a]! ? b : a));
    out.push(best);
    remaining[best]!--;
    progress[best]! += 1 / Math.max(1, counts[best]!);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Carousel outline: one slide per line, `Slide N — Headline | supporting line`.
// ---------------------------------------------------------------------------

export interface OutlineSlide { headline: string; support: string | null }

export function parseOutline(script: string): OutlineSlide[] {
  const out: OutlineSlide[] = [];
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const body = line.replace(/^(?:slide\s*)?\d+\s*[—–\-:.)]\s*/i, "").replace(/^[-•*]\s*/, "");
    if (!body) continue;
    const [h, ...rest] = body.split("|");
    const headline = (h ?? "").trim().replace(/^["“]|["”]$/g, "");
    if (!headline) continue;
    const support = rest.join("|").trim() || null;
    out.push({ headline, support });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reels: what is spoken, and when the contact number appears.
// ---------------------------------------------------------------------------

const PHONE = /\+?\d[\d\s-]{8,}\d/g;

/**
 * The approved script as it is read aloud: slide markers, hashtags and emoji
 * removed, and the phone number never spoken ("the number on your screen").
 * The words are otherwise untouched: the reel is cut to the script, never the
 * script to the reel.
 */
export function spokenText(script: string): string {
  return script
    .split(/\r?\n/)
    .map((l) => l.replace(/^(?:slide\s*)?\d+\s*[—–\-:.)]\s*/i, "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\b(?:on|at|to)\s+the\s+number\s+on\s+your\s+screen\b/gi, "on the number on your screen")
    .replace(/(?:on|at)\s+(\+?\d[\d\s-]{8,}\d)/g, "on the number on your screen")
    .replace(PHONE, "the number on your screen")
    .replace(/\bkm\b/gi, "kilometres")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Word { text: string; start: number; end: number }

/** Even timings for a read at `wps` words a second (offline, no voice). */
export function timeWordsEvenly(text: string, wps: number): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  const per = 1 / Math.max(0.5, wps);
  let t = 0.3;
  return words.map((w) => {
    const pause = /[.!?]$/.test(w) ? per * 0.8 : /[,;:]$/.test(w) ? per * 0.3 : 0;
    const word = { text: w, start: round(t), end: round(t + per * 0.92) };
    t += per + pause;
    return word;
  });
}

export function voiceDuration(words: readonly Word[], fallbackSeconds: number): number {
  return words.length ? round(words[words.length - 1]!.end + 0.4) : fallbackSeconds;
}

export interface Cue { start: number; end: number; text: string }

/** Per-word timings → short phrase cues (≤ 3 words / 22 characters, break at punctuation). */
export function groupWords(words: readonly Word[], maxWords = 3, maxChars = 22): Cue[] {
  const cues: Cue[] = [];
  let buf: Word[] = [];
  const flush = () => {
    if (!buf.length) return;
    cues.push({ start: buf[0]!.start, end: Math.max(buf[buf.length - 1]!.end, buf[0]!.start + 0.1), text: buf.map((w) => w.text).join(" ") });
    buf = [];
  };
  for (const w of words) {
    const joined = [...buf, w].map((x) => x.text).join(" ");
    if (buf.length && (buf.length >= maxWords || joined.length > maxChars)) flush();
    buf.push(w);
    if (/[.!?,:;]$/.test(w.text) && buf.length >= 2) flush();
  }
  flush();
  // Hold each cue until the next one starts (no flicker between phrases).
  for (let i = 0; i < cues.length - 1; i++) if (cues[i + 1]!.start - cues[i]!.end < 0.35) cues[i]!.end = cues[i + 1]!.start;
  return cues;
}

/**
 * When the voiceover points at "the number on your screen", the number plate
 * appears from the start of that sentence until the end. Null when the script
 * has no such call to action (a festival greeting): then no number is shown.
 */
export function contactCueStart(words: readonly Word[]): number | null {
  const texts = words.map((w) => w.text.toLowerCase());
  let hit = -1;
  texts.forEach((t, i) => { if (t.includes("number") || t.includes("whatsapp")) hit = i; });
  if (hit < 0) return null;
  let j = hit;
  while (j > 0 && !/[.!?]$/.test(texts[j - 1]!.trim())) j--;
  return words[j]!.start;
}

// ---------------------------------------------------------------------------
// Reel shot plan
// ---------------------------------------------------------------------------

export type Motion = "in" | "out" | "left" | "right";
export type Transition = "cut" | "fade" | "dissolve";
export interface Shot {
  index: number;
  start: number;
  end: number;
  source: "library" | "ai";
  asset_id: string | null;
  in_point: number;
  visual: string;
  motion: Motion;
  transition_in: Transition;
  caption_text: string | null;
}
export interface ManifestEntry { id: string; kind: "image" | "video"; duration_seconds: number | null; description: string; tags: string[]; folder: string | null; area: string | null; look: string }

export const MIN_SHOT_S = 1.5;
export const MAX_SHOT_S = 7;
const MOTIONS: readonly Motion[] = ["in", "out", "left", "right"];

export const maxShotsFor = (total: number) => Math.max(4, Math.min(20, Math.round(total / 3.2)));

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Repair the Scene Director's plan into a valid, contiguous timeline: unknown
 * assets are swapped for unused library ones (or AI when allowed), the venue is
 * never AI when AI is off, clips fit inside their source, the timeline covers
 * the voiceover exactly, and photo moves vary.
 */
export function normalizeShots(raw: readonly Partial<Shot>[], total: number, manifest: ReadonlyMap<string, ManifestEntry>, aiAllowed: boolean, maxShots = maxShotsFor(total)): Shot[] {
  const base: Shot = { index: 0, start: 0, end: total, source: "library", asset_id: null, in_point: 0, visual: "", motion: "in", transition_in: "cut", caption_text: null };
  const sorted = [...raw].map((s) => ({ ...base, ...s, start: Number(s.start ?? 0), end: Number(s.end ?? 0) })).sort((a, b) => a.start - b.start);
  const used = new Set<string>();
  const pickUnused = (): string | null => {
    for (const kind of ["video", "image"] as const) for (const [id, m] of manifest) if (!used.has(id) && m.kind === kind) return id;
    return null;
  };
  const pickAny = () => manifest.keys().next().value ?? null;
  const fixed: Shot[] = [];
  for (const s0 of sorted.length ? sorted : [{ ...base, source: (aiAllowed && manifest.size === 0 ? "ai" : "library") as Shot["source"], visual: "A diya being lit, warm light" }]) {
    const s = { ...s0 };
    if (s.source === "library") {
      if (!s.asset_id || !manifest.has(s.asset_id)) {
        const alt = pickUnused() ?? (used.size >= manifest.size ? pickAny() : null);
        if (alt) s.asset_id = alt;
        else if (aiAllowed) { s.source = "ai"; s.asset_id = null; s.visual ||= "A close detail: marigold and jasmine on brass"; }
        else continue;
      }
      if (s.asset_id) used.add(s.asset_id);
    } else if (!aiAllowed) {
      const alt = pickUnused() ?? pickAny();
      if (!alt) continue;
      s.source = "library"; s.asset_id = alt; used.add(alt);
    } else {
      s.asset_id = null;
    }
    fixed.push(s);
  }
  const list = fixed.slice(0, Math.max(1, maxShots));
  if (!list.length) return [];
  // A video shot never asks for more than its clip holds (the assembler holds the last frame if scaling stretches it).
  const durations = list.map((s) => {
    const meta = s.asset_id ? manifest.get(s.asset_id) : undefined;
    const clip = s.source === "library" && meta?.kind === "video" && meta.duration_seconds ? meta.duration_seconds : Infinity;
    return Math.max(MIN_SHOT_S, Math.min(MAX_SHOT_S, clip, (s.end - s.start) || 3));
  });
  const scale = total / (durations.reduce((a, b) => a + b, 0) || 1);
  let t = 0;
  return list.map((s, i) => {
    const start = round(t);
    let end = i === list.length - 1 ? round(total) : round(t + durations[i]! * scale);
    end = Math.max(end, round(start + 0.5));
    t = end;
    const meta = s.asset_id ? manifest.get(s.asset_id) : undefined;
    let inPoint = 0;
    if (s.source === "library" && meta?.kind === "video" && meta.duration_seconds) {
      inPoint = Math.max(0, Math.min(Number(s.in_point) || 0, Math.max(0, meta.duration_seconds - (end - start))));
    }
    const motion = MOTIONS.includes(s.motion) ? s.motion : "in";
    return {
      ...s, index: i, start, end, in_point: round(inPoint),
      motion: s.source === "library" && meta?.kind === "image" && i > 0 && motion === list[i - 1]?.motion ? MOTIONS[(MOTIONS.indexOf(motion) + 1) % MOTIONS.length]! : motion,
      transition_in: i === 0 ? "cut" : (["cut", "fade", "dissolve"] as const).includes(s.transition_in) ? s.transition_in : "cut",
    };
  });
}

/** Words for a target length (2.3 words a second by default) and its hard ceiling. */
export function reelWordBudget(seconds: number, wps: number): { words: number; ceiling: number } {
  const words = Math.round(seconds * wps);
  return { words, ceiling: Math.round(words * 1.15) };
}
