"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };
const EDITORS = ["owner", "event_manager", "staff", "accounts"] as const;

export interface ExtraInput { kind: string; name: string; quantity: string; unitCost: string; supplier: string; functionId: string; area: string; returnBy: string; stockItemId: string; notes: string }

/** Something rented or bought for this event. Its cost goes into the wedding's costing; a purchase joins our stock when it arrives. */
export async function addDecorExtra(weddingId: string, x: ExtraInput): Promise<Result> {
  await requireStaff([...EDITORS]);
  const name = x.name.trim();
  const qty = Number(x.quantity || "1");
  const cost = Number(x.unitCost.replace(/[₹,\s]/g, ""));
  if (x.kind !== "rented" && x.kind !== "purchased") return { error: "Rented or bought?" };
  if (name.length < 2) return { error: "What is it?" };
  if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) return { error: "Quantity must be a whole number." };
  if (!Number.isFinite(cost) || cost < 0) return { error: "Enter the cost per piece in rupees." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("event_decor_extras").insert({
    wedding_id: weddingId, kind: x.kind, name: name.slice(0, 120), quantity: qty, unit_cost_paise: Math.round(cost * 100),
    supplier: x.supplier.trim() || null, function_id: x.functionId || null, area: x.area.trim() || null,
    return_by: x.kind === "rented" && x.returnBy ? x.returnBy : null,
    decor_item_id: x.kind === "purchased" && x.stockItemId ? x.stockItemId : null, notes: x.notes.trim() || null,
  });
  revalidatePath(`/team/weddings/${weddingId}`);
  return error ? { error: friendlyError(error) } : {};
}

export async function setDecorExtraStatus(weddingId: string, id: string, status: "received" | "returned" | "cancelled"): Promise<Result> {
  await requireStaff([...EDITORS]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("event_decor_extras").update({ status }).eq("id", id).eq("wedding_id", weddingId);
  revalidatePath(`/team/weddings/${weddingId}`);
  revalidatePath("/team/decor");
  return error ? { error: friendlyError(error) } : {};
}
