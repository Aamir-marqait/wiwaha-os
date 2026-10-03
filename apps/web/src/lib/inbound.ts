import "server-only";
import type { InboundLead } from "@wiwaha/integrations";
import { toIngestPayload } from "@wiwaha/integrations";
import { normalisePhone } from "@wiwaha/db";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "./supabase/admin";

/** Shared secret for webhooks whose providers don't sign requests (?key=…). */
export function hasWebhookKey(req: NextRequest): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  const got = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-webhook-secret");
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Records a webhook once. Returns null when this exact event was already received (a retry). */
export async function recordInbound(source: string, externalId: string, payload: unknown): Promise<string | null> {
  const db = createAdminClient("system");
  const { data, error } = await db.from("inbound_events").insert({ source, external_id: externalId, payload: payload as object }).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`record inbound: ${error.message}`);
  }
  return data.id as string;
}

/**
 * A message from a family that has already booked goes to their Wedding Room
 * (the Wedding Room agent answers it); anyone else becomes or updates a lead.
 */
export async function routeInbound(lead: InboundLead, eventId: string): Promise<{ leadId: string | null; weddingId: string | null }> {
  const db = createAdminClient("system");
  const phone = normalisePhone(lead.phone);
  if (phone && (lead.source === "whatsapp" || lead.source === "instagram")) {
    const { data: contact } = await db.from("contacts").select("id").eq("phone_e164", phone).maybeSingle();
    if (contact) {
      const { data: wc } = await db.from("wedding_contacts").select("wedding_id, weddings!inner(status)").eq("contact_id", contact.id).in("weddings.status", ["tentative", "active"]).limit(1).maybeSingle();
      if (wc?.wedding_id) {
        const { data: msg } = await db.from("messages").insert({
          wedding_id: wc.wedding_id, channel: lead.source, direction: "inbound", status: "received", author_kind: "contact",
          to_address: null, body: lead.message ?? "(attachment)", client_visible: true, metadata: { from: phone, contact_id: contact.id, event_id: eventId },
        }).select("id").single();
        await db.from("agent_tasks").insert({ kind: "family_message", wedding_id: wc.wedding_id, payload: { message_id: msg?.id ?? null, contact_id: contact.id } });
        await db.from("inbound_events").update({ processed_at: new Date().toISOString(), wedding_id: wc.wedding_id }).eq("id", eventId);
        return { leadId: null, weddingId: wc.wedding_id as string };
      }
    }
  }
  const { data, error } = await db.rpc("ingest_lead", { p: { ...toIngestPayload(lead), phone_e164: phone ?? lead.phone } });
  if (error) {
    await db.from("inbound_events").update({ error: error.message }).eq("id", eventId);
    throw new Error(error.message);
  }
  const leadId = (Array.isArray(data) ? data[0]?.lead_id : null) as string | null;
  await db.from("inbound_events").update({ processed_at: new Date().toISOString(), lead_id: leadId }).eq("id", eventId);
  return { leadId, weddingId: null };
}
