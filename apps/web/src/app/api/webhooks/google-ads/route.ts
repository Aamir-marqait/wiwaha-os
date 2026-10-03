import { after, NextResponse, type NextRequest } from "next/server";
import { parseGoogleAdsLead } from "@wiwaha/integrations";
import { runRouting } from "@/lib/agents";
import { recordInbound, routeInbound } from "@/lib/inbound";

/** Google Ads lead form extension webhook; the key is set in the form's webhook settings. */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  const lead = parseGoogleAdsLead(body, process.env.GOOGLE_ADS_WEBHOOK_KEY);
  if (!lead) return NextResponse.json({ error: "invalid lead or key" }, { status: 400 });
  const eventId = await recordInbound("google_ads", lead.externalId, body);
  if (!eventId) return NextResponse.json({ ok: true, duplicate: true });
  const out = await routeInbound(lead, eventId);
  after(async () => { await runRouting(); });
  return NextResponse.json({ ok: true, ...out });
}
