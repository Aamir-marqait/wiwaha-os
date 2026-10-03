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
