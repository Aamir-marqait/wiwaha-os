import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { fontDir } from "./slide";
import { fetchMedia } from "./storage";

/**
 * The moodboard deck as a PDF the team can open, edit elsewhere and send, in
 * the shape of the team's own decks: a cover with the couple's names and
 * palette, a title page per function (day, date, area, guests), then each
 * space as it is next to the décor planned for it.
 */

export interface DeckSlide { areaName: string; element: string; caption: string | null; baseUrl: string | Buffer | null; imageUrl: string | Buffer | null; ai: boolean }
export interface DeckFunction { name: string; dateLabel: string; areas: string[]; guests: number | null; theme: string; description: string | null; slides: DeckSlide[] }
export interface DeckInput { couple: string; palette: string[]; functions: DeckFunction[]; labelAi: boolean }

const PAGE = { w: 1600, h: 900 };
const OLIVE = rgb(0x45 / 255, 0x4e / 255, 0x3d / 255);
const IVORY = rgb(0xf7 / 255, 0xf5 / 255, 0xf0 / 255);
const STONE = rgb(0xb4 / 255, 0xb3 / 255, 0xa7 / 255);
const GOLD = rgb(0xb8 / 255, 0x95 / 255, 0x5a / 255);
const INK = rgb(0x3a / 255, 0x3f / 255, 0x35 / 255);

const hexRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0xc9a24b;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function centred(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color = OLIVE, x0 = 0, width = PAGE.w) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x0 + (width - w) / 2, y, size, font, color });
}

async function embedPhoto(doc: PDFDocument, src: string | Buffer | null, cache: Map<string | Buffer, PDFImage>): Promise<PDFImage | null> {
  if (!src) return null;
  const url = src;
  if (cache.has(url)) return cache.get(url)!;
  try {
    const jpg = await sharp(typeof src === "string" ? await fetchMedia(src) : src).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
    const img = await doc.embedJpg(jpg);
    cache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

/** Draw an image to cover a box (cropped by a clip-free fit: we letterbox within the box instead). */
function drawFit(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
}

export async function buildMoodboardPdf(input: DeckInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const dir = fontDir();
  const serif = await doc.embedFont(await readFile(path.join(dir, "CormorantGaramond-SemiBold.ttf")), { subset: false });
  const serifItalic = await doc.embedFont(await readFile(path.join(dir, "CormorantGaramond-MediumItalic.ttf")), { subset: false });
  const sans = await doc.embedFont(await readFile(path.join(dir, "Poppins-Medium.ttf")), { subset: true });
  doc.setTitle(`${input.couple}: décor moodboard`);
  doc.setAuthor("Wiwaha by Praman");
  const cache = new Map<string | Buffer, PDFImage>();

  // Cover
  const cover = doc.addPage([PAGE.w, PAGE.h]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: IVORY });
  cover.drawRectangle({ x: 36, y: 36, width: PAGE.w - 72, height: PAGE.h - 72, borderColor: GOLD, borderWidth: 1.5, opacity: 0 });
  centred(cover, input.couple.toUpperCase(), serif, 64, 560);
  centred(cover, "Décor moodboard", serifItalic, 104, 420);
  const sw = 110, gap = 18, n = Math.min(6, input.palette.length);
  const x0 = (PAGE.w - (n * sw + (n - 1) * gap)) / 2;
  input.palette.slice(0, 6).forEach((c, i) => cover.drawRectangle({ x: x0 + i * (sw + gap), y: 250, width: sw, height: 130, color: hexRgb(c) }));
  centred(cover, "W I W A H A", serif, 30, 120);
  centred(cover, "BY PRAMAN", sans, 11, 98, GOLD);

  for (const fn of input.functions) {
    // Function title page
    const t = doc.addPage([PAGE.w, PAGE.h]);
    t.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: rgb(1, 1, 1) });
    centred(t, fn.name.toUpperCase(), serif, 120, 470);
    centred(t, fn.theme, serifItalic, 48, 395, GOLD);
    const meta = [fn.dateLabel, fn.areas.join(" & ").toUpperCase(), fn.guests ? `${fn.guests} GUESTS` : ""].filter(Boolean);
    meta.forEach((m, i) => centred(t, m, serif, 40, 300 - i * 52, INK));
    if (fn.description) wrap(fn.description, sans, 18, 1000).slice(0, 3).forEach((l, i) => centred(t, l, sans, 18, 120 - i * 28, INK));

    for (const s of fn.slides) {
      const p = doc.addPage([PAGE.w, PAGE.h]);
      p.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: rgb(1, 1, 1) });
      // Left: the space as it is, on the stone panel.
      const lw = PAGE.w * 0.47;
      p.drawRectangle({ x: 0, y: 0, width: lw, height: PAGE.h, color: STONE });
      centred(p, "THE SPACE", serif, 56, PAGE.h - 110, OLIVE, 0, lw);
      const base = await embedPhoto(doc, s.baseUrl, cache);
      if (base) drawFit(p, base, 36, 170, lw - 72, PAGE.h - 330);
      else centred(p, "Photo to come", serifItalic, 30, PAGE.h / 2, OLIVE, 0, lw);
      centred(p, s.areaName.toUpperCase(), serif, 50, 80, OLIVE, 0, lw);
      // Right: what it becomes.
      const rx = lw + 40, rw = PAGE.w - lw - 80;
      wrap(s.element.toUpperCase(), sans, 46, rw).slice(0, 2).forEach((l, i) => centred(p, l, sans, 46, PAGE.h - 105 - i * 56, INK, rx, rw));
      const img = await embedPhoto(doc, s.imageUrl, cache);
      const top = PAGE.h - 180;
      if (img) drawFit(p, img, rx, 190, rw, top - 190);
      else centred(p, "Picture to come", serifItalic, 30, PAGE.h / 2, INK, rx, rw);
      if (s.caption) wrap(s.caption, sans, 26, rw - 40).slice(0, 3).forEach((l, i) => centred(p, l, sans, 26, 140 - i * 36, INK, rx, rw));
      if (s.ai && input.labelAi && img) p.drawText("AI preview: a guide to the mood, not exact pieces", { x: rx, y: 40, size: 13, font: sans, color: GOLD });
    }
  }
  return doc.save();
}
