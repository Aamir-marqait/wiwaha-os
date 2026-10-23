"use server";
import { addDays, todayIST } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type R = { error?: string; ok?: string };

export async function markPurchase(id: string, status: "ordered" | "received"): Promise<R> {
  await requireStaff(["owner", "staff"]);
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_requests").update({ status }).eq("id", id).in("status", status === "ordered" ? ["requested", "approved"] : ["ordered"]);
  revalidatePath("/team/estate");
  return error ? { error: friendlyError(error) } : {};
}

/** "Done today": the schedule's next due date moves on by its frequency. */
export async function markMaintenanceDone(id: string): Promise<R> {
  await requireStaff(["owner", "staff"]);
  const supabase = await createClient();
  const { data: s } = await supabase.from("maintenance_schedules").select("frequency_days").eq("id", id).maybeSingle();
  if (!s) return { error: "Schedule not found." };
  const today = todayIST();
  const { error } = await supabase.from("maintenance_schedules").update({ last_done_on: today, next_due_on: addDays(today, Number(s.frequency_days)) }).eq("id", id);
  revalidatePath("/team/estate");
  return error ? { error: friendlyError(error) } : { ok: "Marked done." };
}

export async function deletePurchase(id: string): Promise<R> {
  await requireStaff(["owner", "staff"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_requests").delete().eq("id", id).select("id");
  revalidatePath("/team/estate");
  if (error) return { error: friendlyError(error) };
  return data?.length ? {} : { error: "Couldn't delete it." };
}
