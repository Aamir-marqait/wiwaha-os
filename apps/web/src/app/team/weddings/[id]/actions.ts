"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { type DatedPart, isEffect, toRpcParts, totalPercent } from "@/lib/payment-parts";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };
const done = (weddingId: string, error: { message?: string; code?: string } | null): Result => {
  revalidatePath(`/team/weddings/${weddingId}`);
  return error ? { error: friendlyError(error) } : {};
};

/** Décor lead finalises a shortlisted board; custom work then goes to Prashanth. */
export async function finaliseMoodboard(weddingId: string, moodboardId: string): Promise<Result> {
  await requireStaff(["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("finalise_moodboard", { p_id: moodboardId });
  if (!error) after(runRouting);
  return done(weddingId, error);
}

/** Prashanth prices an off-book or custom line before approving the quote. */
export async function repriceLine(weddingId: string, lineId: string, rupeesEach: number): Promise<Result> {
  await requireStaff(["owner"]);
  if (!Number.isFinite(rupeesEach) || rupeesEach < 0) return { error: "Enter a price in rupees." };
  const supabase = await createClient("team");
  const { data: line } = await supabase.from("quote_lines").select("quantity").eq("id", lineId).maybeSingle();
  if (!line) return { error: "Line not found." };
  const unit = Math.round(rupeesEach * 100);
  const { error } = await supabase.from("quote_lines").update({ unit_price_paise: unit, line_total_paise: Math.round(unit * Number(line.quantity)), off_book: false }).eq("id", lineId);
  return done(weddingId, error);
}

/** The chef has checked an approved menu. */
export async function chefConfirmMenu(weddingId: string, menuId: string): Promise<Result> {
  await requireStaff(["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("menus").update({ status: "chef_confirmed" }).eq("id", menuId).eq("status", "client_approved");
  return done(weddingId, error);
}

/** A vendor confirmed by phone instead of through their link. */
export async function setVendorStatus(weddingId: string, bookingId: string, status: "confirmed" | "declined"): Promise<Result> {
  await requireStaff(["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("vendor_bookings").update({ status, replied_at: new Date().toISOString() }).eq("id", bookingId);
  // The database queues the Vendor Coordinator (checklist, or the next vendor after a decline).
  if (!error) after(runRouting);
  return done(weddingId, error);
}

/** Staff write into the couple's portal chat (visible to them at once). */
export async function postToRoom(weddingId: string, body: string): Promise<Result> {
  const viewer = await requireStaff(["owner", "event_manager", "sales"]);
  if (!body.trim()) return { error: "Write a message first." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("messages").insert({
    wedding_id: weddingId, channel: "portal", direction: "outbound", status: "sent", author_kind: "staff", author_user_id: viewer.userId,
    body: body.trim(), client_visible: true, sent_at: new Date().toISOString(), metadata: { name: viewer.profile.full_name },
  });
  return done(weddingId, error);
}

/** Handover inspection after the event: areas, photos and damage; Finance then proposes the deposit decision. */
export async function recordInspection(weddingId: string, items: { area: string; ok: boolean; note: string; damageRupees: number; photoPath: string | null }[]): Promise<Result> {
  const viewer = await requireStaff(["owner", "staff", "event_manager"]);
  if (!items.length) return { error: "Add at least one area." };
  const supabase = await createClient("team");
  const { data: policy } = await supabase.from("policies").select("value").eq("key", "closeout.inspection").maybeSingle();
  const photoRequired = !!(policy?.value as { photo_required?: boolean } | null)?.photo_required;
  if (photoRequired && items.some((i) => !i.ok && !i.photoPath)) return { error: "Add a photo for each area with damage." };
  const rows = items.map((i) => ({ area: i.area, ok: i.ok, note: i.note || null, photo_path: i.photoPath, damage_paise: Math.round((i.damageRupees || 0) * 100) }));
  const damage = rows.reduce((s, r) => s + r.damage_paise, 0);
  const { error } = await supabase.from("inspections").upsert({ wedding_id: weddingId, inspector_id: viewer.userId, inspected_at: new Date().toISOString(), items: rows, damage_total_paise: damage }, { onConflict: "wedding_id" });
  if (error) return done(weddingId, error);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient("system").from("agent_tasks").insert({ kind: "inspection_done", wedding_id: weddingId, payload: { damage_paise: damage } });
  after(runRouting);
  return done(weddingId, null);
}

/**
 * Accounts record a payment that arrived by bank transfer, UPI or cheque. The database does the rest:
 * receipt number, the milestone's effect (the part that signs the contract opens décor) and the receipt message.
 */
export async function recordPayment(weddingId: string, paymentId: string, input: { method: string; reference: string; rupees: number }): Promise<Result> {
  await requireStaff(["owner", "accounts"]);
  if (!["upi", "bank_transfer", "cheque", "cash", "card", "netbanking", "other"].includes(input.method)) return { error: "Choose how it was paid." };
  const supabase = await createClient("team");
  const { data: p } = await supabase.from("payments").select("id, amount_paise, status").eq("id", paymentId).eq("wedding_id", weddingId).maybeSingle();
  if (!p) return { error: "Payment not found." };
  if (p.status === "paid") return { error: "This payment is already recorded." };
  const paise = Math.round((input.rupees || Number(p.amount_paise) / 100) * 100);
  if (!(paise > 0)) return { error: "Enter the amount received." };
  const { error } = await supabase.from("payments").update({ status: "paid", paid_at: new Date().toISOString(), paid_amount_paise: paise, method: input.method, gateway: "manual", gateway_ref: input.reference.trim() || null }).eq("id", paymentId);
  if (!error) after(runRouting);
  return done(weddingId, error);
}

// ---------------------------------------------------------------------------
// Functions and family, added by staff (couples add theirs in the portal brief)
// ---------------------------------------------------------------------------
const FUNCTION_TYPES = ["haldi", "mehendi", "sangeet", "wedding", "reception", "engagement", "cocktail", "pooja", "other"];
export interface FunctionInput { type: string; name: string; date: string; start: string; end: string; guests: string; spaceId: string; rituals: string }

export async function saveFunction(weddingId: string, functionId: string | null, f: FunctionInput): Promise<Result> {
  await requireStaff(["owner", "sales", "event_manager"]);
  if (!FUNCTION_TYPES.includes(f.type)) return { error: "Choose the type of function." };
  if (!f.name.trim()) f.name = f.type[0]!.toUpperCase() + f.type.slice(1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return { error: "Each function needs a date." };
  const guests = f.guests ? Number(f.guests) : null;
  if (guests !== null && (!Number.isInteger(guests) || guests < 1)) return { error: "Guests must be a whole number." };
  const row = { wedding_id: weddingId, type: f.type, name: f.name.trim(), date: f.date, start_time: f.start || null, end_time: f.end || null, guest_count: guests, space_id: f.spaceId || null, rituals: f.rituals.trim() || null };
  const supabase = await createClient("team");
  const { error } = functionId ? await supabase.from("event_functions").update(row).eq("id", functionId).eq("wedding_id", weddingId) : await supabase.from("event_functions").insert(row);
  return done(weddingId, error);
}

export async function deleteFunction(weddingId: string, functionId: string): Promise<Result> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("event_functions").delete().eq("id", functionId).eq("wedding_id", weddingId);
  if (error?.code === "23503") return { error: "This function already has menus, moodboards or a run-of-show. Change it instead of deleting it." };
  return done(weddingId, error);
}

const RELATIONS = ["bride", "groom", "parent", "sibling", "relative", "planner", "friend", "other"];
const MEMBER_ROLE: Record<string, string> = { bride: "couple", groom: "couple", parent: "parent", planner: "planner" };
export interface FamilyInput { name: string; phone: string; email: string; relation: string; keyContact: boolean; portal: boolean }

/** A family member: their contact, a place in the family list, and (optionally) their own portal login. */
export async function addFamilyMember(weddingId: string, p: FamilyInput): Promise<Result> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const { normalisePhone } = await import("@wiwaha/db");
  const name = p.name.trim();
  const email = p.email.trim().toLowerCase();
  const phone = p.phone.trim() ? normalisePhone(p.phone) : null;
  if (name.length < 2) return { error: "Add their name." };
  if (p.phone.trim() && !phone) return { error: "That phone number doesn't look right." };
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "That email doesn't look right." };
  if (p.portal && !email) return { error: "A portal login needs an email." };
  const relation = RELATIONS.includes(p.relation) ? p.relation : "other";
  const supabase = await createClient("team");

  // Same phone = same person: reuse their contact rather than duplicate it.
  let contactId: string | null = null;
  if (phone) contactId = ((await supabase.from("contacts").select("id").eq("phone_e164", phone).maybeSingle()).data?.id as string | undefined) ?? null;
  if (!contactId) {
    const { data, error } = await supabase.from("contacts").insert({ full_name: name, phone_e164: phone, email: email || null, role: relation, consent_whatsapp: !!phone, consent_email: !!email }).select("id").single();
    if (error) return done(weddingId, error);
    contactId = data.id as string;
  }
  const { error: e2 } = await supabase.from("wedding_contacts").upsert({ wedding_id: weddingId, contact_id: contactId, relation: relation.charAt(0).toUpperCase() + relation.slice(1), is_key_contact: p.keyContact }, { onConflict: "wedding_id,contact_id" });
  if (e2) return done(weddingId, e2);

  if (p.portal) {
    const role = MEMBER_ROLE[relation] ?? "family";
    const couple = role === "couple";
    const { error: e3 } = await supabase.from("wedding_members").insert({
      wedding_id: weddingId, contact_id: contactId, email, display_name: name.split(" ")[0], member_role: role,
      can_start_stages: couple, can_edit_brief: couple || role === "parent" || role === "planner", can_approve: couple, can_view_payments: couple, can_manage_members: couple,
    });
    if (e3 && e3.code !== "23505") return done(weddingId, e3);
    after(async () => {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { env } = await import("@/lib/env");
      await createAdminClient("system").auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: `${env.appUrl()}/auth/callback?next=/portal` });
    });
  }
  return done(weddingId, null);
}

/** Prashanth gives this wedding its own payment parts. Paid parts stay as they are (enforced in the database). */
export async function setWeddingParts(weddingId: string, parts: DatedPart[]): Promise<Result> {
  await requireStaff(["owner"]);
  if (totalPercent(parts) !== 100) return { error: `The parts add up to ${totalPercent(parts)}%; they must add up to 100%.` };
  if (parts.some((p) => !p.label.trim() || !p.dueOn || !isEffect(p.effect))) return { error: "Each part needs a name, a due date and what it unlocks." };
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("set_payment_parts", { p_wedding: weddingId, p_parts: toRpcParts(parts) });
  if (!error) after(runRouting);
  return done(weddingId, error);
}

/** Puts chosen catalogue options in front of the couple (they can only pick from what's sent). */
export async function sendOptions(weddingId: string, vertical: "entertainment" | "extras", optionIds: string[], functionId: string | null, note: string): Promise<Result> {
  const viewer = await requireStaff(["owner", "event_manager"]);
  if (!optionIds.length) return { error: "Tick at least one option." };
  const supabase = await createClient("team");
  const { data: opts, error } = await supabase.from("service_options").select("id, name, description, image_url").eq("vertical", vertical).eq("active", true).in("id", optionIds.slice(0, 40));
  if (error) return done(weddingId, error);
  const now = new Date().toISOString();
  const { error: e2 } = await supabase.from("wedding_selections").insert((opts ?? []).map((o) => ({
    wedding_id: weddingId, function_id: functionId || null, option_id: o.id, vertical, name: o.name, description: o.description, image_url: o.image_url,
    status: "sent", sent_at: now, sent_by: viewer.userId, staff_note: note.trim() || null,
  })));
  return done(weddingId, e2);
}

/** The couple chose it and it's confirmed: it becomes part of the plan (and later, the costing). */
export async function finaliseSelection(weddingId: string, id: string): Promise<Result> {
  const viewer = await requireStaff(["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("wedding_selections").update({ status: "final", finalised_at: new Date().toISOString(), finalised_by: viewer.userId }).eq("id", id).eq("status", "chosen");
  return done(weddingId, error);
}

/** Take back an option that isn't final yet. */
export async function withdrawSelection(weddingId: string, id: string): Promise<Result> {
  await requireStaff(["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("wedding_selections").delete().eq("id", id).neq("status", "final");
  return done(weddingId, error);
}

/** "Noted": the family's idea has been seen and will be picked up when planning opens. */
export async function noteIdea(weddingId: string, ideaId: string): Promise<Result> {
  const viewer = await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("wedding_ideas").update({ noted_at: new Date().toISOString(), noted_by: viewer.userId }).eq("id", ideaId);
  return done(weddingId, error);
}

/** The family WhatsApp group's invite link, once the event manager has made it. */
export async function saveGroupLink(weddingId: string, url: string): Promise<Result> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const link = url.trim();
  if (link && !/^https:\/\/chat\.whatsapp\.com\/\S+$/.test(link)) return { error: "Paste the group's invite link (https://chat.whatsapp.com/…)." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("weddings").update({ whatsapp_group_url: link || null }).eq("id", weddingId);
  if (!error && link) {
    const { data: t } = await supabase.from("tasks").select("id").eq("wedding_id", weddingId).eq("title", "Create the family WhatsApp group").neq("status", "done").maybeSingle();
    if (t) await supabase.rpc("complete_task", { p_task_id: t.id, p_note: "Group link saved on the Wedding Room" });
  }
  return done(weddingId, error);
}

/** Prashanth approves (or sends back) the costing; approving releases the quote to the couple. */
export async function decideCosting(weddingId: string, approvalId: string, decision: "approved" | "rejected"): Promise<Result> {
  await requireStaff(["owner"]);
  const { decide } = await import("@/app/team/approvals/actions");
  const r = await decide(approvalId, decision, null, decision === "approved" ? "Approved from the costing view" : "Sent back from the costing view");
  revalidatePath(`/team/weddings/${weddingId}`);
  return r;
}

/** The welcome text at the top of the guest page. */
export async function saveGuestWelcome(weddingId: string, text: string): Promise<Result> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("weddings").update({ guest_welcome: text.trim().slice(0, 2000) || null }).eq("id", weddingId);
  return done(weddingId, error);
}

/** Staff confirm, complete or cancel a guest's add-on request. */
export async function setGuestRequestStatus(weddingId: string, id: string, status: "confirmed" | "done" | "cancelled"): Promise<Result> {
  const viewer = await requireStaff(["owner", "sales", "event_manager", "accounts"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("guest_requests").update({ status, handled_by: viewer.userId }).eq("id", id);
  return done(weddingId, error);
}

/** Prashanth or the event manager opens a stage now, ahead of its date (the family can't). */
export async function openStageNow(weddingId: string, stageId: string): Promise<Result> {
  await requireStaff(["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("start_stage", { p_stage_id: stageId });
  if (!error) after(runRouting);
  return done(weddingId, error);
}
