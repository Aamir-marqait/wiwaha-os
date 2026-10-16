"use server";
import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth";
import { DECOR_CATEGORIES, isCondition } from "@/lib/decor";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };
const EDITORS = ["owner", "event_manager", "staff"] as const;
const done = (error: { message?: string; code?: string } | null): Result => {
  revalidatePath("/team/decor", "layout");
  return error ? { error: friendlyError(error) } : {};
};

export interface DecorInput { name: string; category: string; photos: string; quantity: string; condition: string; location: string; notes: string; active: boolean; unitCost?: string; useCost?: string }

/** "₹4,500" or "4500" → paise; blank → null. */
function paise(v: string | undefined): number | null | "bad" {
  const t = (v ?? "").replace(/[₹,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : "bad";
}

/** Add or edit a piece of décor stock (photos are uploaded first, then saved as links). */
export async function saveDecorItem(id: string | null, d: DecorInput): Promise<Result> {
  await requireSection("decor", EDITORS);
  const name = d.name.trim();
  const qty = Number(d.quantity);
  if (name.length < 2) return { error: "Give it a name." };
  if (!Number.isInteger(qty) || qty < 0) return { error: "Quantity must be a whole number." };
  if (!isCondition(d.condition)) return { error: "Choose its condition." };
  const unit = paise(d.unitCost), use = paise(d.useCost);
  if (unit === "bad" || use === "bad") return { error: "Costs are amounts in rupees." };
  const urls = d.photos.split(/\s+/).filter((u) => /^https:\/\/\S+$/.test(u)).slice(0, 12);
  const row = {
    name, category: (DECOR_CATEGORIES as readonly string[]).includes(d.category) ? d.category : "other", photos: urls.map((url) => ({ url })),
    quantity: qty, condition: d.condition, location: d.location.trim() || null, notes: d.notes.trim() || null, active: d.active,
    ...(d.unitCost !== undefined ? { unit_cost_paise: unit } : {}), ...(d.useCost !== undefined ? { use_cost_paise: use } : {}),
  };
  const supabase = await createClient("team");
  const { error } = id ? await supabase.from("decor_items").update(row).eq("id", id) : await supabase.from("decor_items").insert(row);
  return done(error);
}

export interface AssignInput { itemId: string; weddingId: string; functionId: string; area: string; quantity: string; notes: string }

/** Promise pieces to an event and the area they'll dress. The database refuses more than we have free on those dates. */
export async function assignDecor(a: AssignInput): Promise<Result> {
  await requireSection("decor", EDITORS);
  const qty = Number(a.quantity);
  if (!a.weddingId) return { error: "Choose the event." };
  if (!a.area.trim()) return { error: "Choose the area it will be used in." };
  if (!Number.isInteger(qty) || qty < 1) return { error: "How many?" };
  const supabase = await createClient("team");
  const { error } = await supabase.from("decor_assignments").insert({
    decor_item_id: a.itemId, wedding_id: a.weddingId, function_id: a.functionId || null, area: a.area.trim().slice(0, 80), quantity: qty, notes: a.notes.trim() || null,
  });
  revalidatePath(`/team/weddings/${a.weddingId}`);
  return done(error);
}

/** Set up at the venue, back in the store (with its condition), or no longer needed. */
export async function setAssignmentStatus(id: string, status: "set_up" | "returned" | "cancelled", returnCondition?: string): Promise<Result> {
  await requireSection("decor", EDITORS);
  const supabase = await createClient("team");
  const { error } = await supabase.from("decor_assignments").update({ status, return_condition: status === "returned" && isCondition(returnCondition) ? returnCondition : null }).eq("id", id);
  return done(error);
}
