import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { fetchMedia } from "./storage";

/**
 * The house slide renderer (D41). Every carousel slide, single post and story
 * is set in code, not by an image model, so the identity the client locked on
 * 2026-09-05 can't drift: two typefaces (Cormorant Garamond for headlines,
 * Poppins for everything else), one scheme per deck (warm white with olive ink,
 * or olive with ivory ink), gold as the only accent, no tiles or boxes behind
 * text, a typographic CTA. Real venue photos are used exactly as they are.
 */

export type Aspect = "4:5" | "1:1" | "9:16";
export type Layout = "photo" | "split" | "type";
export type Scheme = "light" | "dark";

export const SIZES: Record<Aspect, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

export const HOUSE = { olive: "#454E3D", ivory: "#F7F5F0", gold: "#B8955A", sage: "#9EA19A", ink: "#2E3428" } as const;

export interface SlideInput {
  aspect: Aspect;
  layout: Layout;
  scheme: Scheme;
  role: "hook" | "content" | "cta";
  kicker?: string | null;
  headline: string;
  support?: string | null;
  /** The picture: one of our photos or an AI detail image (a URL we stored, or the bytes). */
  imageUrl?: string | Buffer | null;
  contactNumber?: string | null;
  logoDarkUrl?: string | Buffer | null;
  logoLightUrl?: string | Buffer | null;
  brandName?: string;
}

type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" | "italic" };
let fontCache: FontSpec[] | null = null;

export function fontDir(): string {
  return path.join(process.cwd(), "assets", "fonts");
}

async function fonts(): Promise<FontSpec[]> {
  if (fontCache) return fontCache;
  const dir = fontDir();
  const load = async (file: string) => {
    const b = await readFile(path.join(dir, file));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  fontCache = [
    { name: "Cormorant", data: await load("CormorantGaramond-SemiBold.ttf"), weight: 600, style: "normal" },
    { name: "Cormorant", data: await load("CormorantGaramond-Medium.ttf"), weight: 500, style: "normal" },
    { name: "Cormorant", data: await load("CormorantGaramond-MediumItalic.ttf"), weight: 500, style: "italic" },
    { name: "Poppins", data: await load("Poppins-Medium.ttf"), weight: 500, style: "normal" },
    { name: "Poppins", data: await load("Poppins-SemiBold.ttf"), weight: 600, style: "normal" },
  ];
  return fontCache;
}

/** Fetch, orient and crop a picture to the frame, as a JPEG data URI satori can draw. */
export async function frameImage(src: string | Buffer, width: number, height: number): Promise<string> {
  const buf = typeof src === "string" ? await fetchMedia(src, 60 * 1024 * 1024) : src;
  const out = await sharp(buf).rotate().resize(width, height, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

async function logoData(src: string | Buffer | null | undefined, maxWidth: number): Promise<string | null> {
  if (!src) return null;
  try {
    const buf = typeof src === "string" ? await fetchMedia(src, 10 * 1024 * 1024) : src;
    const out = await sharp(buf).resize({ width: maxWidth, withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Headline size from its length: the headline is the hero of the slide. */
export function headlineSize(text: string, width: number, layout: Layout, aspect: Aspect): number {
  const n = text.length;
  const base = n <= 22 ? 104 : n <= 36 ? 92 : n <= 52 ? 80 : n <= 72 ? 68 : 58;
  const scale = (width / 1080) * (aspect === "9:16" ? 1.08 : aspect === "1:1" ? 0.92 : 1) * (layout === "split" ? 0.86 : 1);
  return Math.round(base * scale);
}

const PHONE = /\+?\d[\d\s-]{8,}\d/;

function Wordmark({ color, size }: { color: string; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: "Cormorant", fontWeight: 600, fontSize: size, letterSpacing: size * 0.32, color, paddingLeft: size * 0.32 }}>WIWAHA</div>
      <div style={{ fontFamily: "Poppins", fontWeight: 500, fontSize: Math.round(size * 0.24), letterSpacing: size * 0.16, color, opacity: 0.85, marginTop: 2, paddingLeft: size * 0.16 }}>BY PRAMAN</div>
    </div>
  );
}

function Mark({ logo, color, size }: { logo: string | null; color: string; size: number }) {
  return logo ? <img src={logo} alt="" style={{ height: size * 1.25, objectFit: "contain" }} /> : <Wordmark color={color} size={size} />;
}

/** Render one slide to a JPEG. */
export async function renderSlide(input: SlideInput): Promise<Buffer> {
  const { width, height } = SIZES[input.aspect];
  const pad = Math.round(width * 0.082);
  const dark = input.scheme === "dark";
  const ground = dark ? HOUSE.olive : HOUSE.ivory;
  const ink = dark ? HOUSE.ivory : HOUSE.olive;
  const hasImage = !!input.imageUrl && input.layout !== "type";
  const layout: Layout = hasImage ? input.layout : "type";
  const imageH = layout === "split" ? Math.round(height * 0.56) : height;
  const picture = hasImage ? await frameImage(input.imageUrl!, width, imageH) : null;
  // On a photo the type is ivory over a soft gradient; on the ground it follows the scheme.
  const onPhoto = layout === "photo";
  const textColor = onPhoto ? HOUSE.ivory : ink;
  const logo = await logoData(onPhoto || dark ? input.logoLightUrl ?? null : input.logoDarkUrl ?? null, 360);
  const hSize = headlineSize(input.headline, width, layout, input.aspect);
  const cta = input.role === "cta";
  const contact = cta ? (input.support && PHONE.test(input.support) ? input.support.match(PHONE)![0] : input.contactNumber ?? null) : null;
  const support = cta && contact && input.support ? input.support.replace(PHONE, "").replace(/[\s:,-]+$/, "").trim() || null : input.support ?? null;

  const text = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: cta && layout === "type" ? "center" : "flex-start", textAlign: cta && layout === "type" ? "center" : "left", width: width - pad * 2 }}>
      {input.kicker ? (
        <div style={{ fontFamily: "Poppins", fontWeight: 500, fontSize: Math.round(width * 0.026), letterSpacing: Math.round(width * 0.0045), textTransform: "uppercase", color: HOUSE.gold, marginBottom: Math.round(hSize * 0.3) }}>{input.kicker}</div>
      ) : null}
      <div style={{ fontFamily: "Cormorant", fontWeight: 600, fontSize: hSize, lineHeight: 1.04, color: textColor, letterSpacing: -0.5 }}>{input.headline}</div>
      <div style={{ width: Math.round(width * 0.07), height: 3, background: HOUSE.gold, marginTop: Math.round(hSize * 0.42), marginBottom: support || contact ? Math.round(hSize * 0.36) : 0 }} />
      {support ? <div style={{ fontFamily: "Poppins", fontWeight: 500, fontSize: Math.round(width * 0.03), lineHeight: 1.45, color: textColor, opacity: 0.92, maxWidth: width - pad * 2 }}>{support}</div> : null}
      {contact ? <div style={{ fontFamily: "Poppins", fontWeight: 600, fontSize: Math.round(width * 0.068), color: textColor, marginTop: Math.round(width * 0.02), letterSpacing: 1 }}>{contact}</div> : null}
    </div>
  );

  const element = (
    <div style={{ display: "flex", width, height, position: "relative", background: ground, overflow: "hidden" }}>
      {picture ? <img src={picture} alt="" width={width} height={imageH} style={{ position: "absolute", left: 0, top: 0, width, height: imageH, objectFit: "cover" }} /> : null}
      {onPhoto ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round(height * 0.66), backgroundImage: "linear-gradient(to bottom, rgba(38,44,34,0) 0%, rgba(38,44,34,0.5) 42%, rgba(38,44,34,0.86) 100%)" }} /> : null}
      {onPhoto ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.round(height * 0.2), backgroundImage: "linear-gradient(to top, rgba(38,44,34,0) 0%, rgba(38,44,34,0.35) 100%)" }} /> : null}
      {layout === "type" ? <div style={{ position: "absolute", left: Math.round(pad * 0.45), top: Math.round(pad * 0.45), right: Math.round(pad * 0.45), bottom: Math.round(pad * 0.45), border: `1.5px solid ${HOUSE.gold}`, opacity: 0.55 }} /> : null}
      <div style={layout === "type" && cta
        ? { position: "absolute", top: Math.round(pad * 0.85), left: 0, width, display: "flex", justifyContent: "center" }
        : { position: "absolute", top: Math.round(pad * 0.85), right: pad, display: "flex", justifyContent: "flex-end" }}>
        <Mark logo={logo} color={onPhoto ? HOUSE.ivory : ink} size={Math.round(width * 0.04)} />
      </div>
      <div style={layout === "split"
        ? { position: "absolute", left: pad, right: pad, top: imageH + Math.round(pad * 0.7), display: "flex" }
        : layout === "type"
          ? { position: "absolute", left: pad, right: pad, top: Math.round(height * 0.12), bottom: Math.round(height * 0.12), display: "flex", flexDirection: "column", justifyContent: "center" }
          : { position: "absolute", left: pad, right: pad, bottom: pad, display: "flex" }}>{text}</div>
    </div>
  );

  const png = Buffer.from(await new ImageResponse(element, { width, height, fonts: await fonts() }).arrayBuffer());
  return sharp(png).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}

/** The wordmark on a transparent ground, for reels when no logo has been uploaded. */
export async function renderWordmarkPng(color: string = HOUSE.ivory, width = 420): Promise<Buffer> {
  const height = Math.round(width * 0.36);
  const el = (
    <div style={{ display: "flex", width, height, alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <Wordmark color={color} size={Math.round(width * 0.13)} />
    </div>
  );
  return Buffer.from(await new ImageResponse(el, { width, height, fonts: await fonts() }).arrayBuffer());
}
