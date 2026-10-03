import { after, NextResponse, type NextRequest } from "next/server";
import { parseWedMeGoodEmail } from "@wiwaha/integrations";
import { runRouting } from "@/lib/agents";
import { hasWebhookKey, recordInbound, routeInbound } from "@/lib/inbound";

/**
 * WedMeGood enquiries arrive by email. Forward them to an inbound-email
 * service (Cloudflare Email Workers, Postmark, Mailgun) that POSTs
 * {messageId, from, subject, text} here with ?key=<WEBHOOK_SECRET>.
 */
export async function POST(req: NextRequest) {
  if (!hasWebhookKey(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { messageId?: string; MessageID?: string; from?: string; From?: string; subject?: string; Subject?: string; text?: string; TextBody?: string } | null;
  const email = { messageId: body?.messageId ?? body?.MessageID ?? "", from: body?.from ?? body?.From ?? null, subject: body?.subject ?? body?.Subject ?? null, text: body?.text ?? body?.TextBody ?? "" };
  if (!email.messageId || !email.text) return NextResponse.json({ error: "messageId and text are required" }, { status: 400 });
  const eventId = await recordInbound("wedmegood", email.messageId, body);
  if (!eventId) return NextResponse.json({ ok: true, duplicate: true });
  const lead = parseWedMeGoodEmail(email);
  if (!lead) return NextResponse.json({ ok: true, unparsed: true, note: "Recorded for a person to look at" });
  const out = await routeInbound(lead, eventId);
  after(async () => { await runRouting(); });
  return NextResponse.json({ ok: true, ...out });
}
