"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type R = { error?: string; ok?: string };

export async function setStock(itemId: string, quantity: number): Promise<R> {
  await requireStaff(["owner", "staff"]);
  if (!Number.isInteger(quantity) || quantity < 0) return { error: "Enter a whole number." };
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").update({ quantity }).eq("id", itemId);
  revalidatePath("/team/estate");
  return error ? { error: friendlyError(error) } : { ok: "Saved." };
}

export async function recordReading(input: { kind: string; reading: number; weddingId: string; notes: string }): Promise<R> {
  const viewer = await requireStaff(["owner", "staff"]);
  if (!Number.isFinite(input.reading)) return { error: "Enter the reading." };
  const supabase = await createClient();
  const { error } = await supabase.from("utility_readings").insert({ kind: input.kind, reading: input.reading, wedding_id: input.weddingId || null, notes: input.notes || null, recorded_by: viewer.userId });
  revalidatePath("/team/estate");
  return error ? { error: friendlyError(error) } : { ok: "Reading recorded." };
}

export async function markPurchase(id: string, status: "ordered" | "received"): Promise<R> {
  await requireStaff(["owner", "staff"]);
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_requests").update({ status }).eq("id", id).in("status", status === "ordered" ? ["requested", "approved"] : ["ordered"]);
  revalidatePath("/team/estate");
  return error ? { error: friendlyError(error) } : {};
}
