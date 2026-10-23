"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { runMorningBrief, runRouting } from "@/lib/agents";
import { env } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
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

/** "90 days to go": a message in the couple's portal telling them planning is open and where the décor form is. */
export async function sendPlanningMessage(weddingId: string): Promise<{ error?: string }> {
  const viewer = await requireStaff(["owner", "event_manager", "sales"]);
  const supabase = await createClient("team");
  const { data: w } = await supabase.from("weddings").select("title, event_start").eq("id", weddingId).maybeSingle();
  if (!w) return { error: "Wedding not found." };
  const days = Math.max(0, Math.round((Date.parse(`${w.event_start as string}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000));
  const body = `${days} days to go! Planning for ${w.title as string} is now open. Please sign in to your portal and fill in the décor form so we can prepare your moodboard: ${env.appUrl()}/portal/decor`;
  const { error } = await supabase.from("messages").insert({
    wedding_id: weddingId, channel: "portal", direction: "outbound", status: "sent", author_kind: "staff", author_user_id: viewer.userId,
    body, client_visible: true, sent_at: new Date().toISOString(), metadata: { name: viewer.profile.full_name, kind: "planning_open" },
  });
  revalidatePath("/team");
  revalidatePath(`/team/weddings/${weddingId}`);
  return error ? { error: friendlyError(error) } : {};
}
