"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type R = { error?: string };

/** Someone on the team sent this approved message by hand (WhatsApp or mail app). */
export async function markSentManually(messageId: string): Promise<R> {
  const viewer = await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient();
  const { data: m } = await supabase.from("messages").select("id, channel, to_address, subject, body, lead_id, wedding_id, status, metadata").eq("id", messageId).maybeSingle();
  if (!m || m.status !== "approved") return { error: "This message isn't waiting to be sent." };
  const now = new Date().toISOString();
  const { error } = await supabase.from("messages").update({ status: "sent", sent_at: now, metadata: { ...((m.metadata as object) ?? {}), manual: true, sent_by: viewer.userId } }).eq("id", messageId).eq("status", "approved");
  if (error) return { error: friendlyError(error) };
  // Outbox rows are written by the service role; this one records who sent it and how.
  await createAdminClient("system").from("outbox").insert({
    kind: m.channel, provider: "manual", to_address: m.to_address, subject: m.subject, body: m.body, status: "sent", message_id: m.id,
    lead_id: m.lead_id, wedding_id: m.wedding_id, attempts: 1, sent_at: now, payload: { sent_by: viewer.userId },
  });
  revalidatePath("/team/outbox");
  revalidatePath("/team");
  return {};
}

/** Not needed after all (the family called, the date changed…). */
export async function dismissMessage(messageId: string): Promise<R> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("messages").update({ status: "rejected" }).eq("id", messageId).eq("status", "approved");
  revalidatePath("/team/outbox");
  revalidatePath("/team");
  return error ? { error: friendlyError(error) } : {};
}
