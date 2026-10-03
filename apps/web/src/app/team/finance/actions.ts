"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["staff", "utilities", "diesel", "fnb", "decor", "vendor", "consumables", "breakage", "marketing", "other"];

export async function addCost(input: { weddingId: string; category: string; rupeesAmount: number; description: string; on: string }): Promise<{ error?: string; ok?: string }> {
  const viewer = await requireStaff(["owner", "accounts"]);
  if (!CATEGORIES.includes(input.category)) return { error: "Choose a category." };
  if (!Number.isFinite(input.rupeesAmount) || input.rupeesAmount <= 0) return { error: "Enter an amount in rupees." };
  const supabase = await createClient();
  const { error } = await supabase.from("cost_entries").insert({ wedding_id: input.weddingId || null, category: input.category, amount_paise: Math.round(input.rupeesAmount * 100), description: input.description || null, incurred_on: input.on || undefined, entered_by: viewer.userId });
  revalidatePath("/team/finance");
  return error ? { error: friendlyError(error) } : { ok: "Cost recorded." };
}
