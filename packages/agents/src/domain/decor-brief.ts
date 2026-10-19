import { z } from "zod";

/**
 * The décor questionnaire the couple fills in when décor opens (D40). It is
 * shared by the portal form and the Design assistant, so the questions, the
 * answer shape and the way answers become a picture brief live in one place.
 * Names are the ones families use at home: mallige, chendu hoova, kuthu vilakku…
 */

export interface Choice { key: string; label: string; hint?: string }

export const TRADITIONS: readonly Choice[] = [
  { key: "kannadiga", label: "Kannadiga" },
  { key: "tamil", label: "Tamil" },
  { key: "telugu", label: "Telugu" },
  { key: "malayali", label: "Malayali" },
  { key: "konkani", label: "Konkani / Mangalorean" },
  { key: "marathi", label: "Marathi" },
  { key: "gujarati", label: "Gujarati" },
  { key: "marwari", label: "Marwari / Rajasthani" },
  { key: "punjabi", label: "Punjabi / Sikh" },
  { key: "north_indian", label: "North Indian (UP, Bihar, Delhi)" },
  { key: "bengali", label: "Bengali" },
  { key: "christian", label: "Christian" },
  { key: "muslim", label: "Muslim (nikah, walima)" },
  { key: "fusion", label: "A mix of two families' traditions" },
];

export const STYLES: readonly Choice[] = [
  { key: "traditional", label: "Traditional", hint: "Brass, flowers, temple feel" },
  { key: "modern_traditional", label: "Modern traditional", hint: "Classic elements, cleaner lines" },
  { key: "royal", label: "Royal / heritage", hint: "Grand, rich fabrics, gold" },
  { key: "garden", label: "Garden / boho", hint: "Greens, wildflowers, cane" },
  { key: "minimal", label: "Contemporary minimal", hint: "Few elements, lots of white space" },
];

/** Colour stories with the swatches shown on the board. */
export const PALETTES: readonly (Choice & { hex: string[] })[] = [
  { key: "ivory_gold", label: "Ivory & gold", hex: ["#F8F3E9", "#E9DCC0", "#C9A24B"] },
  { key: "blush_rose", label: "Blush & rose", hex: ["#F2D4D7", "#E3A6B0", "#C57B87"] },
  { key: "haldi", label: "Marigold & mango (haldi)", hex: ["#F6C445", "#F29B30", "#7FA34A"] },
  { key: "rani_orange", label: "Rani pink & orange", hex: ["#D6336C", "#F28C28", "#FFD166"] },
  { key: "sage_white", label: "Sage & white", hex: ["#A9B79A", "#E8EDE3", "#FFFFFF"] },
  { key: "red_gold", label: "Kumkum red & gold", hex: ["#A4161A", "#D4A017", "#F5E6C8"] },
  { key: "emerald_gold", label: "Emerald & gold", hex: ["#1F5F4A", "#C9A24B", "#F2EAD3"] },
  { key: "pastels", label: "Soft pastels", hex: ["#F7D6E0", "#D7E9F7", "#E8F3D6"] },
  { key: "lavender", label: "Lavender & lilac", hex: ["#C8B6E2", "#9D84C9", "#F3EEF9"] },
  { key: "peach_coral", label: "Peach & coral", hex: ["#F9C9A8", "#F28C78", "#FFF1E6"] },
  { key: "burgundy_champagne", label: "Burgundy & champagne", hex: ["#6B2A3A", "#E7D3B0", "#B08D57"] },
  { key: "white_green", label: "All white & green", hex: ["#FFFFFF", "#DCE5D0", "#5E7D4E"] },
];

export const FLOWERS: readonly Choice[] = [
  { key: "mallige", label: "Mallige / jasmine strings" },
  { key: "marigold", label: "Marigold (chendu hoova / genda)" },
  { key: "roses", label: "Roses" },
  { key: "tuberose", label: "Tuberose (sugandharaja / rajnigandha)" },
  { key: "orchids", label: "Orchids" },
  { key: "lotus", label: "Lotus" },
  { key: "gypsophila", label: "Baby's breath (gypsophila)" },
  { key: "carnations", label: "Carnations" },
  { key: "lilies", label: "Lilies" },
  { key: "chrysanthemum", label: "Sevanthige / chrysanthemum" },
  { key: "banana", label: "Banana plants and leaves" },
  { key: "mango_leaves", label: "Mango-leaf thoranas" },
  { key: "coconut", label: "Tender coconut fronds and leaf drops" },
  { key: "greens", label: "Fresh greens and ferns" },
];

export const ELEMENTS: readonly Choice[] = [
  { key: "brass_lamps", label: "Brass lamps (kuthu vilakku, deepa)" },
  { key: "urli", label: "Brass urli with floating flowers" },
  { key: "kalasha", label: "Kalasha with coconut and mango leaves" },
  { key: "rangoli", label: "Rangoli / kolam" },
  { key: "thorana", label: "Flower thoranas at the doors" },
  { key: "banana_entrance", label: "Banana trees at the entrance" },
  { key: "bells", label: "Brass bells (ghante)" },
  { key: "art_backdrop", label: "Pichwai or Tanjore-style backdrop" },
  { key: "umbrellas", label: "Traditional umbrellas (chhatri)" },
  { key: "cane", label: "Cane, bamboo and baskets" },
  { key: "diyas", label: "Diyas, lanterns and candles" },
  { key: "phoolon_chadar", label: "Phoolon ki chaadar for the bride's entry" },
  { key: "jhoola", label: "Jhoola (swing)" },
  { key: "fabric_drapes", label: "Fabric drapes on the ceiling" },
  { key: "name_board", label: "A welcome name board" },
  { key: "selfie_booth", label: "A photo or selfie corner" },
];

export const MANDAP_STYLES: readonly Choice[] = [
  { key: "wooden_pillars", label: "Carved wooden pillars", hint: "South Indian, temple feel" },
  { key: "floral_canopy", label: "Floral canopy" },
  { key: "hanging_strings", label: "Hanging mallige and rose strings" },
  { key: "minimal_frame", label: "Minimal frame with florals" },
  { key: "open_sky", label: "Open to the sky, flowers at the base" },
];

export const MOODS: readonly Choice[] = [
  { key: "grand", label: "Grand" },
  { key: "intimate", label: "Intimate" },
  { key: "festive", label: "Festive and colourful" },
  { key: "serene", label: "Calm and serene" },
  { key: "playful", label: "Playful" },
];

export const SEATING: readonly Choice[] = [
  { key: "round_tables", label: "Round tables" },
  { key: "diwan_gadi", label: "Diwan and gadi seating with bolsters" },
  { key: "theatre", label: "Rows facing the stage" },
  { key: "lounge", label: "Lounge clusters" },
  { key: "floor", label: "Floor seating (baithak)" },
];

export const LIGHTING: readonly Choice[] = [
  { key: "daylight", label: "Natural daylight" },
  { key: "fairy", label: "Fairy lights" },
  { key: "lanterns", label: "Hanging lanterns" },
  { key: "chandeliers", label: "Chandeliers" },
  { key: "diyas_candles", label: "Diyas and candles" },
  { key: "uplighting", label: "Coloured uplighting" },
];

export const FEELS: readonly Choice[] = [
  { key: "minimal", label: "Keep it light and elegant" },
  { key: "balanced", label: "Balanced" },
  { key: "lavish", label: "Full and lavish" },
];

const keys = (list: readonly Choice[]) => list.map((c) => c.key) as [string, ...string[]];
const pick = (list: readonly Choice[]) => z.array(z.string()).catch([]).transform((v) => v.filter((k) => keys(list).includes(k)));
const one = (list: readonly Choice[]) => z.string().optional().catch(undefined).transform((v) => (v && keys(list).includes(v) ? v : undefined));
const text = (max: number) => z.string().optional().catch(undefined).transform((v) => (v ? v.trim().slice(0, max) || undefined : undefined));

export const functionAnswersSchema = z.object({
  areas: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).catch([]).transform((v) => [...new Set(v)].slice(0, 12)),
  mood: one(MOODS),
  seating: one(SEATING),
  lighting: pick(LIGHTING),
  must_haves: text(500),
});

export const decorAnswersSchema = z.object({
  traditions: pick(TRADITIONS),
  tradition_note: text(200),
  style: one(STYLES),
  palettes: pick(PALETTES).transform((v) => v.slice(0, 3)),
  avoid_colours: text(200),
  flowers: pick(FLOWERS),
  elements: pick(ELEMENTS),
  feel: one(FEELS),
  mandap_style: one(MANDAP_STYLES),
  name_board_text: text(80),
  functions: z.record(z.string(), functionAnswersSchema).catch({}),
  inspiration: text(1000),
  avoid: text(500),
  notes: text(1000),
});

export type DecorAnswers = z.infer<typeof decorAnswersSchema>;
export type FunctionAnswers = z.infer<typeof functionAnswersSchema>;

/** Tolerant: unknown keys are dropped, bad values become empty, never throws. */
export function parseDecorAnswers(raw: unknown): DecorAnswers {
  const r = decorAnswersSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return r.success ? r.data : decorAnswersSchema.parse({});
}

/** True once the couple has told us enough to brief the image model. */
export function decorAnswersComplete(a: DecorAnswers): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!a.style) missing.push("the overall style");
  if (a.palettes.length === 0) missing.push("at least one colour story");
  if (a.flowers.length === 0) missing.push("the flowers and greens you love");
  return { ok: missing.length === 0, missing };
}

const label = (list: readonly Choice[], key: string | undefined) => list.find((c) => c.key === key)?.label;
const labels = (list: readonly Choice[], ks: readonly string[]) => ks.map((k) => label(list, k)).filter((x): x is string => !!x);

export function paletteHex(a: DecorAnswers): string[] {
  const hex = a.palettes.flatMap((k) => PALETTES.find((p) => p.key === k)?.hex ?? []);
  return hex.length ? [...new Set(hex)].slice(0, 6) : ["#7A8F6E", "#C9A24B", "#F8F3E9"];
}

/** A short human summary for the team (Wedding Room) and the model. */
export function summariseDecorAnswers(a: DecorAnswers): string[] {
  const out: string[] = [];
  const trad = labels(TRADITIONS, a.traditions);
  if (trad.length || a.tradition_note) out.push(`Tradition: ${[...trad, a.tradition_note].filter(Boolean).join(", ")}`);
  if (a.style) out.push(`Style: ${label(STYLES, a.style)}`);
  if (a.feel) out.push(`Feel: ${label(FEELS, a.feel)}`);
  if (a.palettes.length) out.push(`Colours: ${labels(PALETTES, a.palettes).join(", ")}${a.avoid_colours ? ` (avoid ${a.avoid_colours})` : ""}`);
  if (a.flowers.length) out.push(`Flowers and greens: ${labels(FLOWERS, a.flowers).join(", ")}`);
  if (a.elements.length) out.push(`Traditional touches: ${labels(ELEMENTS, a.elements).join(", ")}`);
  if (a.mandap_style) out.push(`Mandap: ${label(MANDAP_STYLES, a.mandap_style)}`);
  if (a.name_board_text) out.push(`Name board: "${a.name_board_text}"`);
  if (a.inspiration) out.push(`Inspiration: ${a.inspiration}`);
  if (a.avoid) out.push(`Please avoid: ${a.avoid}`);
  if (a.notes) out.push(`Notes: ${a.notes}`);
  return out;
}

export function summariseFunctionAnswers(f: FunctionAnswers | undefined): string[] {
  if (!f) return [];
  return [
    f.mood ? `Mood: ${label(MOODS, f.mood)}` : "",
    f.seating ? `Seating: ${label(SEATING, f.seating)}` : "",
    f.lighting.length ? `Lighting: ${labels(LIGHTING, f.lighting).join(", ")}` : "",
    f.must_haves ? `Must-haves: ${f.must_haves}` : "",
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Which areas a function uses, and what each area is dressed as.
// ---------------------------------------------------------------------------
export interface AreaInfo { id: string; name: string; kind: string; description: string | null; space_id: string | null; suits: string[]; sort: number }

/**
 * The couple's choice first; otherwise the area of the function's booked
 * space, then the entrances and areas that usually host this function.
 */
export function areasForFunction(fn: { type: string; space_id: string | null }, chosen: readonly string[], areas: readonly AreaInfo[], max: number): AreaInfo[] {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const picked = chosen.map((id) => byId.get(id)).filter((a): a is AreaInfo => !!a);
  if (picked.length) return picked.slice(0, max);
  const sorted = [...areas].sort((a, b) => a.sort - b.sort);
  const main = sorted.filter((a) => fn.space_id && a.space_id === fn.space_id);
  const suits = sorted.filter((a) => a.suits.includes(fn.type) && !main.includes(a));
  const big = ["wedding", "reception", "engagement"].includes(fn.type);
  const entrances = big ? suits.filter((a) => a.kind === "entrance" || a.kind === "pathway") : [];
  const venues = suits.filter((a) => !entrances.includes(a));
  const order = [...main, ...(main.length ? [] : venues.slice(0, 1)), ...entrances, ...venues.slice(main.length ? 0 : 1)];
  return [...new Map(order.map((a) => [a.id, a])).values()].slice(0, max);
}

/** What the area becomes for this function: 'Mandap', 'Entrance door décor'… */
export function elementFor(area: { kind: string }, fnType: string): string {
  switch (area.kind) {
    case "entrance": return "Entrance décor";
    case "pathway": return "Pathway décor";
    case "lawn": return fnType === "wedding" ? "Mandap" : fnType === "reception" ? "Stage backdrop" : "Lawn setting and seating";
    case "hall": return fnType === "pooja" ? "Puja backdrop" : fnType === "haldi" ? "Haldi setup" : fnType === "sangeet" ? "Stage and dance floor" : fnType === "wedding" ? "Mandap" : "Hall setting";
    case "poolside": return fnType === "mehendi" ? "Mehendi backdrop and seating" : fnType === "haldi" ? "Haldi setup" : "Poolside setting";
    case "amphitheatre": return fnType === "sangeet" ? "Sangeet stage" : "Stage and seating";
    case "courtyard": return fnType === "haldi" ? "Haldi setup" : "Courtyard setting";
    default: return "Décor setting";
  }
}

const FUNCTION_NAMES: Record<string, string> = {
  haldi: "haldi", mehendi: "mehendi", sangeet: "sangeet", wedding: "wedding ceremony (muhurtham)", reception: "reception",
  engagement: "engagement (nischitartha)", cocktail: "cocktail evening", pooja: "pooja", other: "celebration",
};

/** A one-line, couple-facing caption when the model isn't available. */
export function templateCaption(element: string, a: DecorAnswers): string {
  const flowers = labels(FLOWERS, a.flowers).slice(0, 2).map((f) => f.split(" (")[0]!.split(" / ")[0]!.toLowerCase());
  const touch = labels(ELEMENTS, a.elements).slice(0, 1).map((e) => e.split(" (")[0]!.toLowerCase());
  const bits = [...flowers, ...touch];
  return bits.length ? `${element} with ${bits.join(", ").replace(/, ([^,]*)$/, " and $1")}` : element;
}

/**
 * The instruction for the image-edit model: dress THIS photo, keep the place.
 * The architecture is never invented or replaced; only décor is added.
 */
export function slidePrompt(p: { areaName: string; areaDescription: string | null; fnType: string; element: string; direction: string; answers: DecorAnswers; fn?: FunctionAnswers; hasReferences: boolean }): string {
  const a = p.answers;
  const colours = labels(PALETTES, a.palettes);
  const flowers = labels(FLOWERS, a.flowers);
  const touches = labels(ELEMENTS, a.elements).filter((e) => !/name board|selfie/i.test(e));
  const f = p.fn;
  const lighting = f ? labels(LIGHTING, f.lighting) : [];
  return [
    `Edit this photograph of the ${p.areaName} at Wiwaha, a wedding estate near Bengaluru${p.areaDescription ? ` (${p.areaDescription})` : ""}.`,
    "Keep the place exactly as it is: the same building, walls, pillars, roof, floor, steps, trees, sky and camera angle. Do not move, remove or redesign anything that is part of the venue. Only add décor.",
    `Dress it as the ${p.element.toLowerCase()} for an Indian ${FUNCTION_NAMES[p.fnType] ?? "celebration"}${a.traditions.length ? ` in the ${labels(TRADITIONS, a.traditions).join(" and ")} tradition` : ""}.`,
    p.direction,
    colours.length ? `Colour story: ${colours.join(", ")}${a.avoid_colours ? `; avoid ${a.avoid_colours}` : ""}.` : "",
    flowers.length ? `Flowers and greens: ${flowers.join(", ")}.` : "",
    touches.length ? `Traditional touches where they belong: ${touches.join(", ")}.` : "",
    a.style ? `Overall style: ${label(STYLES, a.style)}${a.feel ? `, ${label(FEELS, a.feel)!.toLowerCase()}` : ""}.` : "",
    f?.mood ? `Mood: ${label(MOODS, f.mood)!.toLowerCase()}.` : "",
    f?.seating && /seating|setting|stage|backdrop/i.test(p.element) ? `Guest seating: ${label(SEATING, f.seating)!.toLowerCase()}.` : "",
    lighting.length ? `Lighting: ${lighting.join(", ").toLowerCase()}.` : "",
    p.hasReferences ? "The other images are photos of our own décor: match their craftsmanship and level of detail, not their location." : "",
    "Photorealistic, real-world scale and perspective, natural shadows, the kind of photo a wedding planner shows a couple. No people, no text, no signage lettering, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}
