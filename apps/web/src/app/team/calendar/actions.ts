"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Books a space or room outright: the date is blocked and confirmed in one step. */
export async function bookDates(_prev: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  await requireStaff(["owner", "sales"]);
  const [kind, resourceId] = String(form.get("resource") ?? "").split(":");
  const startsOn = String(form.get("starts_on") ?? "");
  const endsOn = String(form.get("ends_on") || startsOn);
  const label = String(form.get("label") ?? "").trim() || "Booked";
  if (!resourceId || (kind !== "space" && kind !== "room")) return { error: "Choose a space or room" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return { error: "Choose a start date" };
  const supabase = await createClient("team");
  const { data, error } = await supabase.rpc("place_hold", {
    p_resource_kind: kind, p_resource_id: resourceId, p_starts_on: startsOn, p_ends_on: endsOn, p_label: label,
  });
  if (error) { revalidatePath("/team/calendar"); return { error: friendlyError(error) }; }
  const id = (data as { id?: string } | null)?.id;
  const confirmed = id ? await supabase.rpc("set_calendar_status", { p_entry_id: id, p_status: "confirmed" }) : null;
  if (confirmed?.error && id) await supabase.rpc("set_calendar_status", { p_entry_id: id, p_status: "released", p_reason: "manual" });
  revalidatePath("/team/calendar");
  return confirmed?.error ? { error: friendlyError(confirmed.error) } : { ok: "Booked." };
}

export async function confirmEntry(entryId: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("set_calendar_status", { p_entry_id: entryId, p_status: "confirmed" });
  revalidatePath("/team/calendar");
  return error ? { error: friendlyError(error) } : {};
}
