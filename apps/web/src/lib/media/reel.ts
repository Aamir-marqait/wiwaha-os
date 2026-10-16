import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { Cue } from "@wiwaha/agents";

/**
 * Reel assembly with ffmpeg (ported from wiwaha-studio media_core/edl.py, D41).
 * Each shot is rendered to a short 1080×1920 clip on its own (so no single
 * call holds several 4K decoders), then one pass joins them, burns the
 * captions in the brand serif (libass, bundled fonts), shows the contact
 * number on its own plate from the CTA sentence on, stamps the logo and mixes
 * the voiceover over a ducked music bed. The LLM never writes ffmpeg.
 */

export const W = 1080, H = 1920, FPS = 30;

export function ffmpegPath(): string {
  try {
    const req = createRequire(import.meta.url);
    const p = req("ffmpeg-static") as unknown as string | { default?: string };
    const path = typeof p === "string" ? p : p.default;
    if (path && existsSync(path)) return path;
  } catch {
    // fall through to the system binary
  }
  return "ffmpeg";
}

export async function run(args: string[], timeoutMs = 240_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("ffmpeg took too long")); }, timeoutMs);
    proc.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (exit ${code}): ${err.slice(-1500)}`));
    });
  });
}

const n3 = (x: number) => (Math.round(x * 1000) / 1000).toFixed(3);

/** A still becomes a moving shot: a slow push-in, pull-back, or lateral drift. */
export function photoShotArgs(input: string, output: string, duration: number, motion: "in" | "out" | "left" | "right"): string[] {
  const d = Math.max(0.5, duration);
  const big = { w: Math.round(W * 1.14), h: Math.round(H * 1.14) };
  const cover = `scale=${big.w}:${big.h}:force_original_aspect_ratio=increase,crop=${big.w}:${big.h},setsar=1`;
  const dx = big.w - W, dy = big.h - H;
  let move: string;
  if (motion === "left" || motion === "right") {
    const x = motion === "left" ? `${dx}*t/${n3(d)}` : `${dx}*(1-t/${n3(d)})`;
    move = `crop=${W}:${H}:'${x}':${Math.round(dy / 2)}`;
  } else {
    // Zoom by scaling each frame down from the oversized canvas, then crop the centre.
    const from = motion === "in" ? 1 : 1.14, to = motion === "in" ? 1.14 : 1;
    const z = `(${from}+(${to}-${from})*t/${n3(d)})`;
    move = `scale=w='trunc(${W}*${z}/2)*2':h='trunc(${H}*${z}/2)*2':eval=frame,crop=${W}:${H}`;
  }
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
    "-loop", "1", "-framerate", String(FPS), "-t", n3(d), "-i", input,
    "-vf", `${cover},${move},fps=${FPS},format=yuv420p`,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", output,
  ];
}

/** Trim and scale one source clip to the canvas (video only). */
export function clipShotArgs(input: string, output: string, start: number, duration: number): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
    "-ss", n3(Math.max(0, start)), "-t", n3(Math.max(0.3, duration)), "-i", input,
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", output,
  ];
}

/** Cumulative xfade offsets: offset_k = Σ durations[0..k] − Σ fades[0..k]. */
export function xfadeOffsets(durations: readonly number[], fades: readonly number[]): number[] {
  if (fades.length !== durations.length - 1) throw new Error("one fade per join");
  const out: number[] = [];
  let dur = durations[0] ?? 0, fade = 0;
  fades.forEach((f, k) => { fade += f; out.push(Math.round((dur - fade) * 1000) / 1000); dur += durations[k + 1]!; });
  return out;
}

// ---------------------------------------------------------------------------
// Captions (ASS): ivory serif on a soft olive plate; the number in Poppins.
// ---------------------------------------------------------------------------
const assTime = (s: number) => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), sec = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
const assText = (t: string) => t.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();

export function buildAss(cues: readonly Cue[], contact: { text: string; start: number } | null, total: number): string {
  // &HAABBGGRR. Ivory #F7F5F0 → F0F5F7; plate olive #262C22 at ~46% → alpha 0x89.
  const header = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Cap,Cormorant Garamond SemiBold,80,&H00F0F5F7,&H00F0F5F7,&H89222C26,&H89222C26,0,0,0,0,100,100,0,0,3,20,0,2,90,90,560,1",
    "Style: Num,Poppins Medium,64,&H00F0F5F7,&H00F0F5F7,&H89222C26,&H89222C26,0,0,0,0,100,100,1,0,3,18,0,2,90,90,330,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const lines = cues.filter((c) => c.text.trim()).map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(Math.min(c.end, total))},Cap,,0,0,0,,${assText(c.text)}`);
  if (contact) lines.push(`Dialogue: 1,${assTime(contact.start)},${assTime(total)},Num,,0,0,0,,${assText(contact.text)}`);
  return [...header, ...lines, ""].join("\n");
}

export interface AssembleInput {
  shots: { path: string; duration: number; transition: "cut" | "fade" | "dissolve" }[];
  voice: string | null;
  music: string | null;
  logo: string | null;
  ass: string;
  fontsDir: string;
  total: number;
  output: string;
}

const escapeFilterPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

/** One ffmpeg pass: join, captions, logo, audio. */
export function assembleArgs(a: AssembleInput): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-threads", "2"];
  a.shots.forEach((s) => args.push("-t", n3(s.duration), "-i", s.path));
  let idx = a.shots.length;
  const voiceIdx = a.voice ? idx++ : null;
  if (a.voice) args.push("-i", a.voice);
  const musicIdx = a.music ? idx++ : null;
  if (a.music) args.push("-stream_loop", "-1", "-i", a.music);
  const logoIdx = a.logo ? idx++ : null;
  if (a.logo) args.push("-i", a.logo);
  const silentIdx = !a.voice && !a.music ? idx++ : null;
  if (silentIdx !== null) args.push("-f", "lavfi", "-t", n3(a.total), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");

  const parts: string[] = a.shots.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p,setsar=1,settb=AVTB[v${i}]`);
  let v = "[v0]";
  if (a.shots.length > 1) {
    const fades = a.shots.slice(1).map((s) => (s.transition === "cut" ? 0 : 0.35));
    if (fades.every((f) => f === 0)) {
      parts.push(`${a.shots.map((_, i) => `[v${i}]`).join("")}concat=n=${a.shots.length}:v=1:a=0,fps=${FPS}[vj]`);
    } else {
      // Cuts join with concat, fades with xfade at the running length minus the fade; every joint re-pins fps and the timebase.
      let prev = "[v0]";
      let length = a.shots[0]!.duration;
      a.shots.slice(1).forEach((s, k) => {
        const out = k === a.shots.length - 2 ? "[vj]" : `[x${k}]`;
        const fade = fades[k]!;
        if (fade > 0) {
          const kind = s.transition === "dissolve" ? "dissolve" : "fade";
          parts.push(`${prev}[v${k + 1}]xfade=transition=${kind}:duration=${fade}:offset=${n3(length - fade)},fps=${FPS},setsar=1,settb=AVTB${out}`);
          length += s.duration - fade;
        } else {
          parts.push(`${prev}[v${k + 1}]concat=n=2:v=1:a=0,fps=${FPS},setsar=1,settb=AVTB${out}`);
          length += s.duration;
        }
        prev = out;
      });
    }
    v = "[vj]";
  }
  // Hold the last frame if the pictures run short of the voice.
  parts.push(`${v}tpad=stop_mode=clone:stop_duration=3[vp]`);
  parts.push(`[vp]subtitles='${escapeFilterPath(a.ass)}':fontsdir='${escapeFilterPath(a.fontsDir)}'[vs]`);
  v = "[vs]";
  if (logoIdx !== null) {
    parts.push(`[${logoIdx}:v]format=rgba,scale=${Math.round(W * 0.2)}:-1[logo]`);
    parts.push(`${v}[logo]overlay=W-w-54:60:format=auto[vl]`);
    v = "[vl]";
  }
  let aOut: string;
  if (voiceIdx !== null && musicIdx !== null) {
    parts.push(`[${musicIdx}:a]volume=-16dB,afade=t=out:st=${n3(Math.max(0, a.total - 1.2))}:d=1.2[bed]`);
    parts.push(`[${voiceIdx}:a]asplit=2[vo][key]`);
    parts.push(`[bed][key]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[duck]`);
    parts.push(`[vo][duck]amix=inputs=2:normalize=0:duration=first[mix]`);
    parts.push(`[mix]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
    aOut = "[aout]";
  } else if (voiceIdx !== null) {
    parts.push(`[${voiceIdx}:a]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
    aOut = "[aout]";
  } else if (musicIdx !== null) {
    parts.push(`[${musicIdx}:a]volume=-6dB,afade=t=out:st=${n3(Math.max(0, a.total - 1.5))}:d=1.5[aout]`);
    aOut = "[aout]";
  } else {
    aOut = `${silentIdx}:a`;
  }
  args.push("-filter_complex", parts.join(";"), "-map", v, "-map", aOut.startsWith("[") ? aOut : aOut);
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", n3(a.total), a.output,
  );
  return args;
}

export function posterArgs(video: string, output: string): string[] {
  return ["-hide_banner", "-loglevel", "error", "-y", "-ss", "1.0", "-i", video, "-frames:v", "1", "-q:v", "3", output];
}

export function silentAudioArgs(seconds: number, output: string): string[] {
  return ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-t", n3(seconds), "-i", "anullsrc=channel_layout=mono:sample_rate=44100", "-c:a", "libmp3lame", "-b:a", "64k", output];
}
