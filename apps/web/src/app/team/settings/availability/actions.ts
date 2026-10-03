"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function addWindow(form: FormData): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const days = form.getAll("weekday").map(Number);
  if (days.length === 0) return { error: "Pick at least one day." };
  const rows = days.map((weekday) => ({ profile_id: String(form.get("profile_id")), weekday, start_time: String(form.get("start")), end_time: String(form.get("end")) }));
  const { error } = await supabase.from("exec_availability").upsert(rows, { onConflict: "profile_id,weekday,start_time" });
  revalidatePath("/team/settings/availability");
  return error ? { error: friendlyError(error) } : {};
}

export async function removeWindow(id: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("exec_availability").delete().eq("id", id);
  revalidatePath("/team/settings/availability");
  return error ? { error: friendlyError(error) } : {};
}
