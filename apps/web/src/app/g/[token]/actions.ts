"use server";
import { normalisePhone } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN = /^[a-f0-9]{24}$/;

/**
 * A wedding guest asks for an add-on (airport pickup, an extra bed…) or sends a
 * message. No login: the couple's link is the key. The request is listed in the
 * Wedding Room (Extras) and goes to the event manager; nothing is charged.
 */
export async function requestAddOn(token: string, input: { optionId: string; name: string; phone: string; room: string; quantity: string; date: string; notes: string }): Promise<{ error?: string; ok?: string }> {
  if (!TOKEN.test(token)) return { error: "This link isn't valid." };
  const name = input.name.trim();
  const phone = input.phone.trim() ? normalisePhone(input.phone) : null;
  const qty = Number(input.quantity || "1");
  if (name.length < 2) return { error: "Please add your name." };
  if (!phone) return { error: "Please add a phone number so we can confirm." };
  if (!Number.isInteger(qty) || qty < 1 || qty > 50) return { error: "Quantity should be between 1 and 50." };
  const db = createAdminClient("public");
  const { data: w } = await db.from("weddings").select("id, title, event_start, event_end, event_manager_id").eq("guest_token", token).maybeSingle();
  if (!w) return { error: "This link isn't valid." };
  if (input.date && (input.date < String(w.event_start).slice(0, 10) || input.date > String(w.event_end).slice(0, 10))) return { error: "Choose one of the celebration days." };
  // No option chosen means "something else": the message says what they need.
  const other = !input.optionId;
  if (other && input.notes.trim().length < 3) return { error: "Tell us what you need." };
  const { data: found } = other ? { data: null } : await db.from("service_options").select("id, name").eq("id", input.optionId).eq("active", true).eq("guest_bookable", true).maybeSingle();
  if (!other && !found) return { error: "That service isn't available." };
  const o = found ?? { id: null, name: "Something else" };
  // A little protection against a shared link being abused.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("guest_requests").select("id", { count: "exact", head: true }).eq("wedding_id", w.id).gte("created_at", since);
  if ((count ?? 0) >= 60) return { error: "We've had a lot of requests in the last hour. Please try again a little later, or ask at the front desk." };
  const { error } = await db.from("guest_requests").insert({
    wedding_id: w.id, option_id: o.id, option_name: o.name, guest_name: name.slice(0, 120), phone_e164: phone, room: input.room.trim().slice(0, 40) || null,
    quantity: qty, wanted_on: input.date || null, notes: input.notes.trim().slice(0, 1000) || null,
  });
  if (error) return { error: "Sorry, that didn't go through. Please ask at the front desk." };
  await db.from("notifications").insert({
    user_id: w.event_manager_id ?? null, role: w.event_manager_id ? null : "event_manager",
    title: `Guest request: ${o.name as string} (${w.title as string})`, body: `${name}${input.room.trim() ? `, room ${input.room.trim()}` : ""} · ${qty}`, link: `/team/weddings/${w.id as string}?tab=extras`,
  });
  revalidatePath(`/g/${token}`);
  return { ok: "Thank you! Our team will confirm with you shortly." };
}
