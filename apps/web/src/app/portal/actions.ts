"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { runRouting } from "@/lib/agents";
import { requireClient } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string };
type PgErr = { message?: string; code?: string } | null;
const result = (paths: string[], error: PgErr, ok?: string): Result => {
  for (const p of paths) revalidatePath(p);
  return error ? { error: friendlyError(error) } : { ok };
};
/** Agent work queued by the database (agent_tasks) is routed right after the response. */
const route = (error: PgErr) => { if (!error) after(runRouting); };

/** The couple presses Start. The database enforces the payment unlock and logs the edit with IP. */
export async function startStage(stageId: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("start_stage", { p_stage_id: stageId });
  route(error);
  return result(["/portal"], error);
}

export async function snoozeStage(stageId: string, until: string, reason: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("snooze_stage", { p_stage_id: stageId, p_until: until, p_reason: reason });
  return result(["/portal"], error);
}

export async function setLanguage(form: FormData): Promise<void> {
  const lang = String(form.get("lang") ?? "en");
  (await cookies()).set("lang", ["en", "kn", "hi"].includes(lang) ? lang : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/portal", "layout");
}

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------
export interface BriefFunction { id?: string; type: string; name: string; date: string; start_time: string; end_time: string; guest_count: string; rituals: string }

export async function saveBrief(weddingId: string, functions: BriefFunction[], answers: Record<string, string | boolean>, submit: boolean): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { data: existing } = await supabase.from("event_functions").select("id").eq("wedding_id", weddingId);
  const keep = new Set(functions.map((f) => f.id).filter(Boolean));
  for (const old of existing ?? []) {
    if (!keep.has(old.id as string)) {
      const { error } = await supabase.from("event_functions").delete().eq("id", old.id);
      if (error) return result([], error);
    }
  }
  for (const [i, f] of functions.entries()) {
    if (!f.name.trim() || !f.date) return { error: "Each function needs a name and a date." };
    const row = { wedding_id: weddingId, type: f.type, name: f.name.trim(), date: f.date, start_time: f.start_time || null, end_time: f.end_time || null, guest_count: f.guest_count ? Number(f.guest_count) : null, rituals: f.rituals.trim() || null, sort: (i + 1) * 10 };
    const { error } = f.id ? await supabase.from("event_functions").update(row).eq("id", f.id) : await supabase.from("event_functions").insert(row);
    if (error) return result([], error);
  }
  if (submit) {
    const { error } = await supabase.rpc("submit_brief", { p_wedding: weddingId, p_answers: answers });
    route(error);
    return result(["/portal/brief", "/portal"], error, "Sent to your event manager. Thank you!");
  }
  const { error } = await supabase.from("wedding_briefs").upsert({ wedding_id: weddingId, answers }, { onConflict: "wedding_id" });
  return result(["/portal/brief"], error, "Saved.");
}

// ---------------------------------------------------------------------------
// Menus, décor, quote
// ---------------------------------------------------------------------------
export async function approveMenu(menuId: string, note: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("client_approve_menu", { p_menu_id: menuId, p_note: note || null });
  route(error);
  return result(["/portal/menus"], error);
}

export async function shortlistMoodboard(id: string, shortlist: boolean, feedback: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("client_shortlist_moodboard", { p_id: id, p_shortlist: shortlist, p_feedback: feedback || null });
  route(error);
  return result(["/portal/decor"], error);
}

export async function approveQuote(quoteId: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("client_approve_quote", { p_quote_id: quoteId });
  route(error);
  return result(["/portal/quote", "/portal"], error);
}

// ---------------------------------------------------------------------------
// Guests & rooms
// ---------------------------------------------------------------------------
export async function addGuest(weddingId: string, g: { name: string; phone: string; partySize: number; checkIn: string; checkOut: string; pickup: boolean; pickupFrom: string; pickupAt: string; notes: string }): Promise<Result> {
  await requireClient();
  if (!g.name.trim() || !g.checkIn || !g.checkOut) return { error: "Add the guest's name and dates." };
  if (g.checkOut < g.checkIn) return { error: "Check-out must be after check-in." };
  const supabase = await createClient("portal");
  const { error } = await supabase.from("room_allocations").insert({
    wedding_id: weddingId, guest_name: g.name.trim(), guest_phone_e164: g.phone.trim() || null, party_size: Math.max(1, g.partySize || 1),
    check_in: g.checkIn, check_out: g.checkOut, needs_pickup: g.pickup, pickup_from: g.pickup ? g.pickupFrom || null : null,
    pickup_at: g.pickup && g.pickupAt ? new Date(`${g.pickupAt}:00+05:30`).toISOString() : null, notes: g.notes.trim() || null,
  });
  return result(["/portal/guests"], error);
}

export async function removeGuest(id: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.from("room_allocations").update({ status: "cancelled" }).eq("id", id);
  return result(["/portal/guests"], error);
}

export async function submitRoomingList(weddingId: string): Promise<Result> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("submit_rooming_list", { p_wedding: weddingId });
  route(error);
  return result(["/portal/guests"], error, "Sent. We'll confirm rooms and pickups shortly.");
}

// ---------------------------------------------------------------------------
// Family members and permissions
// ---------------------------------------------------------------------------
const PERMS = ["can_start_stages", "can_edit_brief", "can_approve", "can_view_payments", "can_manage_members"] as const;
export type Perm = (typeof PERMS)[number];

export async function setPermission(memberId: string, perm: Perm, value: boolean): Promise<Result> {
  await requireClient();
  if (!PERMS.includes(perm)) return { error: "Unknown permission." };
  const supabase = await createClient("portal");
  const { error } = await supabase.from("wedding_members").update({ [perm]: value }).eq("id", memberId);
  return result(["/portal/family"], error);
}

export async function inviteMember(weddingId: string, m: { name: string; email: string; role: string }): Promise<Result> {
  await requireClient();
  const email = m.email.trim().toLowerCase();
  if (!m.name.trim() || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Add a name and a valid email." };
  const role = ["couple", "parent", "family", "planner"].includes(m.role) ? m.role : "family";
  const supabase = await createClient("portal");
  const { error } = await supabase.from("wedding_members").insert({ wedding_id: weddingId, email, display_name: m.name.trim(), member_role: role, can_start_stages: false, can_edit_brief: role === "parent" || role === "planner", can_approve: false, can_view_payments: false, can_manage_members: false });
  if (error) return result([], error);
  // Send the login invite with the service role (server-only); the membership above is the permission.
  after(async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { env } = await import("@/lib/env");
    await createAdminClient("system").auth.admin.inviteUserByEmail(email, { data: { full_name: m.name.trim() }, redirectTo: `${env.appUrl()}/auth/callback?next=/portal` });
  });
  return result(["/portal/family"], null, "Invitation sent.");
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
export async function postMessage(weddingId: string, body: string): Promise<Result> {
  const viewer = await requireClient();
  if (!body.trim()) return { error: "Write a message first." };
  const supabase = await createClient("portal");
  const { error } = await supabase.from("messages").insert({
    wedding_id: weddingId, channel: "portal", direction: "inbound", status: "received", author_kind: "client", author_user_id: viewer.userId,
    body: body.trim().slice(0, 4000), client_visible: true, metadata: { name: viewer.profile.full_name },
  });
  route(error);
  return result(["/portal/chat"], error);
}
