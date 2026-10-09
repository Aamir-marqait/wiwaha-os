"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
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
 * receipt number, the milestone's effect (the 40% signs the contract and opens décor) and the receipt message.
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
