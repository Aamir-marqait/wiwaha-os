/** Décor stock vocabularies (decor_items / decor_assignments check constraints). */
export const CONDITIONS = ["new", "good", "fair", "needs_repair", "damaged"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = { new: "New", good: "Good", fair: "Fair", needs_repair: "Needs repair", damaged: "Damaged" };
export const CONDITION_TONE: Record<Condition, "sage" | "gold" | "burgundy" | "neutral" | "solid"> = { new: "solid", good: "sage", fair: "gold", needs_repair: "burgundy", damaged: "burgundy" };
export const DECOR_CATEGORIES = ["florals", "drapes_fabric", "lighting", "props", "furniture", "backdrops", "urlis_brass", "signage", "candles", "other"] as const;
export const isCondition = (v: unknown): v is Condition => typeof v === "string" && (CONDITIONS as readonly string[]).includes(v);
export const pretty = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
