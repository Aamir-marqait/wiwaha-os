import { createIntegrations } from "@wiwaha/integrations";
import { after, NextResponse, type NextRequest } from "next/server";
import { runRouting } from "@/lib/agents";
import { markPaymentPaid } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay webhooks (payment_link.paid). The signature is checked with
 * RAZORPAY_WEBHOOK_SECRET; the payment link's reference_id is our payment id.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const channels = createIntegrations(process.env);
  if (!channels.payments.verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const body = JSON.parse(raw) as { event?: string; payload?: { payment_link?: { entity?: { id?: string; reference_id?: string; amount_paid?: number } }; payment?: { entity?: { id?: string; method?: string } } } };
  const db = createAdminClient("system");
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${body.event}:${body.payload?.payment?.entity?.id ?? ""}`;
  const { data: seen } = await db.from("inbound_events").upsert({ source: "razorpay", external_id: eventId, payload: body }, { onConflict: "source,external_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (!seen) return NextResponse.json({ ok: true, duplicate: true });
  if (body.event !== "payment_link.paid") return NextResponse.json({ ok: true, ignored: body.event });
  const link = body.payload?.payment_link?.entity;
  if (!link?.reference_id) return NextResponse.json({ error: "no reference" }, { status: 400 });
  const method = body.payload?.payment?.entity?.method;
  const res = await markPaymentPaid(link.reference_id, {
    amountPaise: link.amount_paid, gateway: "razorpay", ref: body.payload?.payment?.entity?.id ?? link.id ?? null,
    method: method === "upi" || method === "card" || method === "netbanking" ? method : "other",
  });
  await db.from("inbound_events").update({ processed_at: new Date().toISOString() }).eq("id", seen.id);
  if (res.updated) after(runRouting);
  return NextResponse.json({ ok: true, ...res });
}
