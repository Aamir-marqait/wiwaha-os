"use server";
import { sendApprovedMessages } from "@wiwaha/agents";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { agentDeps, runRouting } from "@/lib/agents";
import { requireSection } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** We approve a work order; only then does it go to the vendor. */
export async function approveWorkOrder(bookingId: string): Promise<{ error?: string }> {
  await requireSection("vendors", ["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("approve_work_order", { p_booking: bookingId });
  revalidatePath("/team/vendors");
  if (!error) after(async () => { await runRouting(); await sendApprovedMessages(agentDeps()); });
  return error ? { error: friendlyError(error) } : {};
}

/** Drop a drafted work order we don't want to send. */
export async function cancelWorkOrder(bookingId: string): Promise<{ error?: string }> {
  await requireSection("vendors", ["owner", "event_manager"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("vendor_bookings").update({ status: "cancelled" }).eq("id", bookingId).is("work_order_approved_at", null);
  revalidatePath("/team/vendors");
  return error ? { error: friendlyError(error) } : {};
}
