/**
 * Broad décor themes per function type (round 1). "standard" themes are the
 * in-house catalogue (priced in the price book); "custom" ones are bespoke
 * and need Prashanth's approval once finalised. Replace or extend with
 * Wiwaha's real catalogue and photo library.
 */
export interface Theme {
  key: string;
  name: string;
  kind: "standard" | "custom";
  palette: string[];
  description: string;
  imagePrompt: string;
}

const T = (key: string, name: string, kind: Theme["kind"], palette: string[], description: string, imagePrompt: string): Theme => ({ key, name, kind, palette, description, imagePrompt });

export const THEMES: Record<string, Theme[]> = {
  haldi: [
    T("marigold-courtyard", "Marigold courtyard", "standard", ["#F2A900", "#FFD166", "#7C9A7E", "#FDFBF6"], "Strings of marigold and mango leaves under the banyan, low seating with bolsters, brass urlis of turmeric and flowers.", "haldi ceremony under a banyan tree, marigold garlands, brass urli, low floor seating, golden morning light"),
    T("sunlit-pastel", "Sunlit pastels", "standard", ["#FFE8A3", "#F7C6C7", "#BFD8B8", "#FFFFFF"], "Soft yellow and blush drapes, woven baskets of flowers, a light swing for the bride.", "pastel haldi setup with flower swing, blush and yellow drapes, woven baskets, outdoor garden"),
    T("temple-brass", "Temple brass", "standard", ["#B8860B", "#8E5A63", "#F2E2B6", "#3E3A2F"], "Traditional brass lamps, banana leaves and kolam patterns for a classic South Indian haldi.", "south indian haldi with brass lamps, banana leaves, kolam floor art, traditional"),
    T("boho-terracotta", "Boho terracotta", "custom", ["#C65D3B", "#E9C46A", "#A3B18A", "#F4EBDC"], "Terracotta pots, pampas, rattan and hand-painted signage for a relaxed, earthy morning.", "boho haldi decor with terracotta pots, pampas grass, rattan furniture, earthy tones"),
    T("floral-canopy", "Floral canopy", "custom", ["#FFB703", "#FB8500", "#FFFFFF", "#8FB996"], "A suspended canopy of fresh yellow blooms over the couple's seating.", "suspended yellow flower canopy over haldi seating, lush, outdoor"),
  ],
  mehendi: [
    T("jaipur-bazaar", "Jaipur bazaar", "standard", ["#E76F51", "#F4A261", "#2A9D8F", "#FDFBF6"], "Colourful umbrellas, block-print cushions, bangle stalls and a mehendi lounge.", "mehendi party with colourful umbrellas, block print cushions, bangle stall, festive bazaar"),
    T("garden-lounge", "Garden lounge", "standard", ["#7C9A7E", "#DDE5B6", "#F7C6C7", "#FFFFFF"], "Low lounges on the lawn, greenery walls and pastel flowers.", "garden mehendi lounge with greenery wall, pastel flowers, low seating, daytime"),
    T("mirror-work", "Mirror-work glow", "custom", ["#D4A373", "#E9EDC9", "#CCD5AE", "#FAEDCD"], "Mirror-work panels and lanterns that catch the evening light.", "mehendi decor with mirror work panels and lanterns, warm evening glow"),
    T("peacock", "Peacock teal", "standard", ["#006D77", "#83C5BE", "#E29578", "#FFDDD2"], "Teal and coral drapes with peacock motifs and floral jharokhas.", "peacock themed mehendi decor, teal and coral drapes, floral jharokha"),
    T("rustic-swings", "Rustic swings", "custom", ["#A98467", "#F0EAD2", "#ADC178", "#DDE5B6"], "Wooden swings wrapped in flowers and fairy lights under the trees.", "mehendi with floral wooden swings under trees, fairy lights, rustic"),
  ],
  sangeet: [
    T("royal-night", "Royal night", "standard", ["#3D0C11", "#B8860B", "#F5E6CA", "#1B1B1B"], "Deep burgundy and gold stage with chandeliers and a dance floor in the Pavilion.", "sangeet stage burgundy and gold, crystal chandeliers, dance floor, night"),
    T("bollywood-retro", "Bollywood retro", "custom", ["#E63946", "#F1FAEE", "#A8DADC", "#1D3557"], "Retro film posters, marquee lights and a photo booth.", "bollywood retro sangeet decor, marquee lights, film posters, photo booth"),
    T("starlit-lawn", "Starlit lawn", "standard", ["#0B132B", "#C9A45C", "#FDFBF6", "#5BC0BE"], "Fairy-light canopy over the lawn, LED dance floor and lounge pods.", "outdoor sangeet with fairy light canopy, LED dance floor, lounge seating"),
    T("neon-garden", "Neon garden", "custom", ["#FF006E", "#8338EC", "#3A86FF", "#06D6A0"], "Neon florals and mirrored stage for a modern party.", "modern sangeet with neon floral installations and mirrored stage"),
    T("ivory-gold", "Ivory and gold", "standard", ["#FDFBF6", "#C9A45C", "#E6DCC6", "#8E5A63"], "Elegant ivory drapes, gold accents and candle clusters.", "elegant ivory and gold sangeet decor, candles, drapes"),
  ],
  wedding: [
    T("classic-mandap", "Classic South Indian mandap", "standard", ["#B8860B", "#C1121F", "#FDFBF6", "#2D6A4F"], "Carved wooden mandap with banana trunks, jasmine strings and brass lamps.", "south indian wedding mandap, carved wood, banana trunks, jasmine strings, brass lamps"),
    T("garden-pastel", "Garden pastel", "standard", ["#F7C6C7", "#FDFBF6", "#A3B18A", "#E6DCC6"], "Open-air floral mandap on the Grand Lawn in blush and ivory.", "open air pastel floral mandap on lawn, blush and ivory flowers, daytime"),
    T("royal-rajasthani", "Royal Rajasthani", "custom", ["#9D0208", "#E85D04", "#FFBA08", "#370617"], "Jharokha frames, rich reds and marigold for a palace-like mandap.", "rajasthani palace style mandap, jharokha frames, red and marigold, royal"),
    T("minimal-ivory", "Minimal ivory and gold", "standard", ["#FDFBF6", "#C9A45C", "#EFEAE2", "#7C9A7E"], "Clean lines, white florals and gold accents for an understated ceremony.", "minimal ivory and gold wedding mandap, white flowers, modern elegant"),
    T("tropical-floral", "Tropical floral", "custom", ["#2D6A4F", "#FF7F51", "#FFD6A5", "#FDFBF6"], "Lush tropical leaves, orchids and heliconia around a floating mandap.", "tropical floral mandap with orchids and heliconia, lush greenery"),
  ],
  reception: [
    T("candlelit-elegance", "Candlelit elegance", "standard", ["#1B1B1B", "#C9A45C", "#FDFBF6", "#8E5A63"], "Long tables, candle clusters and a floral stage backdrop.", "reception with candle clusters, long tables, floral stage backdrop, evening"),
    T("sage-and-gold", "Sage and gold", "standard", ["#7C9A7E", "#C9A45C", "#FDFBF6", "#E6DCC6"], "Wiwaha's signature palette with greenery arches and gold chargers.", "reception decor sage green and gold, greenery arches, gold chargers"),
    T("crystal-ballroom", "Crystal ballroom", "custom", ["#E5E5E5", "#FFFFFF", "#C0C0C0", "#8E5A63"], "Crystal installations and white florals for a glamorous evening.", "glamorous reception with crystal installations and white flowers"),
    T("lantern-lawn", "Lantern lawn", "standard", ["#F4A261", "#264653", "#E9C46A", "#FDFBF6"], "Hundreds of lanterns over the lawn with a warm, festive glow.", "reception on lawn under hanging lanterns, warm glow, night"),
    T("art-deco", "Art deco", "custom", ["#000000", "#D4AF37", "#FFFFFF", "#2F4F4F"], "Black, gold and geometric art-deco details.", "art deco wedding reception black and gold geometric decor"),
  ],
};

export function themesFor(type: string, count: number): Theme[] {
  const list = THEMES[type] ?? THEMES.reception!;
  return list.slice(0, count);
}

/** Round 2: detail variations of a shortlisted theme. */
export function detailVariations(base: { theme: string; palette: string[]; description: string | null; design_kind: string }): { theme: string; palette: string[]; description: string }[] {
  const [a, b, c, d] = base.palette;
  return [
    { theme: `${base.theme}: floral detail`, palette: [a ?? "#FDFBF6", b ?? "#C9A45C", c ?? "#7C9A7E", d ?? "#8E5A63"], description: `${base.description ?? ""} Detail pass: florals, entrance and stage focal point.`.trim() },
    { theme: `${base.theme}: lighting and seating`, palette: [d ?? "#8E5A63", a ?? "#FDFBF6", b ?? "#C9A45C", c ?? "#7C9A7E"], description: `${base.description ?? ""} Detail pass: lighting plan, seating and table styling.`.trim() },
  ];
}
