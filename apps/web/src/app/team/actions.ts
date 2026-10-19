"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { runMorningBrief, runRouting } from "@/lib/agents";
import { createClient } from "@/lib/supabase/server";

export async function generateBriefNow(): Promise<{ error?: string }> {
  await requireStaff(["owner"]);
  const out = await runMorningBrief();
  revalidatePath("/team");
  if (out.status === "disabled") return { error: "The Chief of Staff is switched off, so the brief went to the human queue." };
  if (out.status === "error") return { error: out.error };
  return {};
}

export async function routeAgentWork(): Promise<{ error?: string }> {
  await requireStaff(["owner"]);
  const out = await runRouting();
  revalidatePath("/team");
  return out.status === "error" ? { error: out.error } : {};
}

/** Clear a notification from Today (role-wide ones clear for everyone in the role). */
export async function markNotificationRead(id: string): Promise<{ error?: string }> {
  await requireStaff();
  const supabase = await createClient("team");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/team");
  return error ? { error: error.message } : {};
}
