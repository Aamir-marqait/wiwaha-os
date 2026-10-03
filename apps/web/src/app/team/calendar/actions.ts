"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function placeHold(_prev: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const [kind, resourceId] = String(form.get("resource") ?? "").split(":");
  const startsOn = String(form.get("starts_on") ?? "");
  const endsOn = String(form.get("ends_on") || startsOn);
  const label = String(form.get("label") ?? "").trim() || "Hold";
  const hoursRaw = String(form.get("hours") ?? "").trim();
  if (!resourceId || (kind !== "space" && kind !== "room")) return { error: "Choose a space or room" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return { error: "Choose a start date" };
  const supabase = await createClient("team");
  const { data, error } = await supabase.rpc("place_hold", {
    p_resource_kind: kind, p_resource_id: resourceId, p_starts_on: startsOn, p_ends_on: endsOn, p_label: label,
    p_hours: hoursRaw ? Number(hoursRaw) : null,
  });
  revalidatePath("/team/calendar");
  if (error) return { error: friendlyError(error) };
  const expires = (data as { expires_at?: string } | null)?.expires_at;
  return { ok: `Held. Releases automatically ${expires ? `at ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(expires))}` : "when it expires"}.` };
}

export async function confirmEntry(entryId: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("set_calendar_status", { p_entry_id: entryId, p_status: "confirmed" });
  revalidatePath("/team/calendar");
  return error ? { error: friendlyError(error) } : {};
}
