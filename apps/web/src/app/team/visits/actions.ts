"use server";
import { recapVisit } from "@wiwaha/agents";
import { PolicyBook, type PolicyRow } from "@wiwaha/policy";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { agentDeps, runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Staff book a visit into a free slot (same rules as the Voice Concierge). */
export async function bookVisitAction(leadId: string, startsAt: string, executiveId: string, attendees: string, attendeeCount: number | null): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { data: rows } = await supabase.from("policies").select("key, topic, title, rule_text, value, version, client_visible, needs_confirmation, sort");
  const book = PolicyBook.fromRows((rows ?? []) as PolicyRow[]);
  const rules = book.get("visits.booking");
  const followUp = book.get("followup.after_visit");
  const { count } = await supabase.from("visits").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
  const start = Date.parse(startsAt);
  const { data: visit, error } = await supabase.from("visits").insert({
    lead_id: leadId, visit_number: (count ?? 0) + 1, scheduled_at: startsAt, duration_minutes: rules.slot_minutes,
    executive_id: executiveId, attendees: attendees || null, attendee_count: attendeeCount,
    follow_up_due_at: new Date(start + followUp.days_after_visit * 86_400_000).toISOString(),
  }).select("id").single();
  if (error) return { error: /visits_no_double_booking/.test(error.message) ? "That executive already has a visit at this time. Pick another slot." : friendlyError(error) };
  await supabase.from("leads").update({ status: "visit_booked" }).eq("id", leadId).in("status", ["new", "contacted"]);
  await createAdminClient("system").from("agent_tasks").insert({ kind: "visit_booked", lead_id: leadId, payload: { visit_id: visit.id } });
  after(async () => { await runRouting(); });
  revalidatePath(`/team/leads/${leadId}`);
  revalidatePath("/team/visits");
  return {};
}

/** The executive finishes the visit and dictates a voice note; Visit Host writes the recap. */
export async function completeVisitAction(visitId: string, leadId: string, note: string, checklist: Record<string, boolean>): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("visits").update({ status: "completed", checklist, notes: note.slice(0, 2000) || null }).eq("id", visitId);
  if (error) return { error: friendlyError(error) };
  await supabase.from("leads").update({ status: "visited" }).eq("id", leadId).in("status", ["new", "contacted", "visit_booked"]);
  if (note.trim()) after(async () => { await recapVisit(agentDeps(), visitId, note.trim()); });
  revalidatePath(`/team/leads/${leadId}`);
  revalidatePath("/team/visits");
  return {};
}

export async function setVisitStatus(visitId: string, leadId: string, status: "no_show" | "cancelled"): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("visits").update({ status, follow_up_outcome: "not_required" }).eq("id", visitId);
  revalidatePath(`/team/leads/${leadId}`);
  revalidatePath("/team/visits");
  return error ? { error: friendlyError(error) } : {};
}
