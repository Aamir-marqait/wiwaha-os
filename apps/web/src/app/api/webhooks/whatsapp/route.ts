import { after, NextResponse, type NextRequest } from "next/server";
import { parseGupshupInbound } from "@wiwaha/integrations";
import { runRouting } from "@/lib/agents";
import { hasWebhookKey, recordInbound, routeInbound } from "@/lib/inbound";

/** WhatsApp via Gupshup: callback URL https://<app>/api/webhooks/whatsapp?key=<WEBHOOK_SECRET>. */
export async function POST(req: NextRequest) {
  if (!hasWebhookKey(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  const lead = parseGupshupInbound(body);
  if (!lead) return NextResponse.json({ ok: true, ignored: true }); // receipts, events
  const eventId = await recordInbound("whatsapp", lead.externalId, body);
  if (!eventId) return NextResponse.json({ ok: true, duplicate: true });
  const out = await routeInbound(lead, eventId);
  after(async () => { await runRouting(); });
  return NextResponse.json({ ok: true, ...out });
}
