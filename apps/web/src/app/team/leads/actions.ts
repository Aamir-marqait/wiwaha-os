"use server";
import type { LeadStatus } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { runLeadDesk, runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { ingestLead, leadInputSchema, toIngestPayload } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  field?: string;
}

export async function createManualLead(_prev: FormState, form: FormData): Promise<FormState> {
  await requireStaff(["owner", "sales"]);
  const parsed = leadInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, field: parsed.error.issues[0]?.path.join(".") };
  const supabase = await createClient("team");
  let leadId: string;
  try {
    const res = await ingestLead(supabase, toIngestPayload(parsed.data, "manual"));
    leadId = res.lead_id;
  } catch (e) {
    return { error: friendlyError({ message: e instanceof Error ? e.message : String(e) }) };
  }
  // ingest_lead queued a task; the Chief of Staff routes it to Lead Desk.
  after(async () => {
    await runRouting();
  });
  revalidatePath("/team/leads");
  redirect(`/team/leads/${leadId}?created=1`);
}

export async function rerunLeadDesk(leadId: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  // Retire the earlier draft so the queue holds one reply per family.
  const supabase = await createClient("team");
  const { data: stale } = await supabase.from("approvals").update({ status: "expired", decision_note: "Superseded by a re-run" }).eq("lead_id", leadId).eq("kind", "lead_reply").eq("status", "pending").select("id");
  const staleIds = (stale ?? []).map((a) => a.id as string);
  if (staleIds.length) await supabase.from("messages").update({ status: "rejected" }).in("approval_id", staleIds);
  const out = await runLeadDesk(leadId, { force: true });
  revalidatePath(`/team/leads/${leadId}`);
  revalidatePath("/team/approvals");
  if (out.status === "error") return { error: out.error };
  if (out.status === "disabled") return { error: "Lead Desk is switched off, so this went to the human queue." };
  if (out.result.skippedReason) return { error: `${out.result.skippedReason}. The score was refreshed.` };
  return {};
}

export async function setLeadStatus(leadId: string, status: LeadStatus): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  revalidatePath(`/team/leads/${leadId}`);
  return error ? { error: friendlyError(error) } : {};
}

export async function holdDateForLead(leadId: string, spaceId: string, startsOn: string, endsOn: string, label: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("place_hold", { p_resource_kind: "space", p_resource_id: spaceId, p_starts_on: startsOn, p_ends_on: endsOn || startsOn, p_lead_id: leadId, p_label: label });
  revalidatePath(`/team/leads/${leadId}`);
  revalidatePath("/team/calendar");
  return error ? { error: friendlyError(error) } : {};
}

export async function releaseEntry(entryId: string, path: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("set_calendar_status", { p_entry_id: entryId, p_status: "released", p_reason: "manual" });
  revalidatePath(path);
  revalidatePath("/team/calendar");
  return error ? { error: friendlyError(error) } : {};
}
