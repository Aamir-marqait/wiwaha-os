/**
 * Which vendor category delivers each kind of costed line. Quote lines carry
 * the price-book category ("decor", "av"…) or, for entertainment and extras,
 * "<vertical>:<type>" ("entertainment:dj", "extras:makeup").
 */
const DELIVERED_BY: Record<string, string[]> = {
  decor: ["decor", "florist"],
  av: ["lighting", "music"],
  catering: ["catering"],
  "entertainment:dj": ["music", "entertainment"],
  "entertainment:live_band": ["music", "entertainment"],
  "entertainment:classical_music": ["music", "entertainment"],
  "entertainment:dhol": ["music", "entertainment"],
  "entertainment:nadaswaram": ["music", "entertainment"],
  "extras:makeup": ["makeup"],
  "extras:hair_styling": ["makeup"],
  "extras:mehendi_artist": ["makeup"],
  "extras:transport": ["transport"],
};

export interface WorkOrderLine { description: string; quantity: number; function_id: string | null; category: string | null; unit_cost_paise: number | null }
export interface WorkOrderItem { description: string; quantity: number; function_id: string | null; function_name: string | null; date: string | null; unit_cost_paise: number | null }

export function deliveredBy(lineCategory: string | null): string[] {
  if (!lineCategory) return [];
  return DELIVERED_BY[lineCategory] ?? (lineCategory.includes(":") ? [lineCategory.split(":")[0]!, lineCategory.split(":")[1]!] : []);
}

/** The work order for one vendor: the approved lines their category delivers. */
export function workOrderFor(vendorCategory: string, lines: WorkOrderLine[], fns: { id: string; name: string; date: string }[]): WorkOrderItem[] {
  return lines.filter((l) => deliveredBy(l.category).includes(vendorCategory)).map((l) => {
    const fn = fns.find((f) => f.id === l.function_id) ?? null;
    return { description: l.description, quantity: l.quantity, function_id: l.function_id, function_name: fn?.name ?? null, date: fn?.date ?? null, unit_cost_paise: l.unit_cost_paise };
  });
}

/** What we expect to pay the vendor, when every item has a cost. */
export function workOrderCost(items: WorkOrderItem[]): number | null {
  if (!items.length || items.some((i) => i.unit_cost_paise == null)) return null;
  return items.reduce((a, i) => a + Math.round((i.unit_cost_paise ?? 0) * i.quantity), 0);
}
