"use server";
import { normalisePhone } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runRouting } from "@/lib/agents";
import { applySplit } from "@/lib/apply-split";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface NewWedding { title: string; name: string; phone: string; email: string; role: string; source: string; start: string; end: string; guests: string; totalRupees: string; managerId: string; rooms: string; parts?: string }

const ROLES = ["bride", "groom", "parent", "sibling", "relative", "planner", "friend", "corporate", "other"];
const SOURCES = ["walk_in", "phone", "referral", "manual", "wedmegood", "website", "whatsapp", "instagram", "other"];

/**
 * A booking that didn't start as a lead in the app (walk-in, phone, referral).
 * It still goes through the same intake (de-duplicated by phone) and the same
 * booking step, so the payment schedule, stage cards, calendar and contract
 * draft all happen exactly as for any other booking.
 */
export async function createWedding(w: NewWedding): Promise<{ error?: string; weddingId?: string; existing?: boolean; note?: string }> {
  await requireStaff(["owner", "sales"]);
  const phone = w.phone.trim() ? normalisePhone(w.phone) : null;
  if (w.name.trim().length < 2) return { error: "Add the main contact's name." };
  if (w.phone.trim() && !phone) return { error: "That phone number doesn't look right." };
  if (!phone && !/^\S+@\S+\.\S+$/.test(w.email.trim())) return { error: "Add a phone number or an email." };
  if (!w.start) return { error: "Choose the first day." };
  const end = w.end || w.start;
  if (end < w.start) return { error: "The last day can't be before the first." };
  const total = Number(w.totalRupees.replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(total) || total <= 0) return { error: "Enter the contract value in rupees." };
  const guests = w.guests ? Number(w.guests) : null;
  if (guests !== null && (!Number.isInteger(guests) || guests < 1)) return { error: "Guests must be a whole number." };

  const supabase = await createClient("team");
  const { data: ing, error: e1 } = await supabase.rpc("ingest_lead", { p: {
    full_name: w.name.trim(), phone_e164: phone, email: w.email.trim().toLowerCase() || null,
    source: SOURCES.includes(w.source) ? w.source : "manual", source_detail: "Added as a booking", event_type: "wedding",
    date_wanted: w.start, date_flexible: false, guest_count: guests, city: null, message: null, consent_whatsapp: !!phone, consent_email: !!w.email.trim(),
  } });
  if (e1) return { error: friendlyError(e1) };
  const row = (Array.isArray(ing) ? ing[0] : ing) as { lead_id: string; contact_id: string } | undefined;
  if (!row) return { error: "Couldn't create the booking." };
  if (ROLES.includes(w.role)) await supabase.from("contacts").update({ role: w.role }).eq("id", row.contact_id);

  const { data: lead } = await supabase.from("leads").select("wedding_id").eq("id", row.lead_id).maybeSingle();
  if (lead?.wedding_id) return { weddingId: lead.wedding_id as string, existing: true };

  const { data: wedding, error: e2 } = await supabase.rpc("mark_lead_booked", {
    p_lead_id: row.lead_id, p_event_start: w.start, p_event_end: end, p_contract_total_paise: Math.round(total * 100),
    p_event_manager_id: w.managerId || null, p_title: w.title.trim() || null,
  });
  if (e2) return { error: friendlyError(e2) };
  const rooms = w.rooms ? Number(w.rooms) : null;
  if (rooms !== null && Number.isInteger(rooms) && rooms >= 0) await supabase.from("weddings").update({ complimentary_rooms: rooms }).eq("id", (wedding as { id: string }).id);
  const note = await applySplit(supabase, (wedding as { id: string }).id, w.start, w.parts);
  revalidatePath("/team/weddings");
  revalidatePath("/team/leads");
  after(runRouting);
  return { weddingId: (wedding as { id: string }).id, note: note ?? undefined };
}
