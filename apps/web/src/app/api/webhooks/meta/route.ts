import { after, NextResponse, type NextRequest } from "next/server";
import { parseMetaLeadFields, parseMetaWebhook, verifyMetaSignature } from "@wiwaha/integrations";
import { runRouting } from "@/lib/agents";
import { recordInbound, routeInbound } from "@/lib/inbound";

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") && p.get("hub.verify_token") === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/** Instagram DMs and Facebook/Instagram lead forms, signed with the app secret. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const body: unknown = JSON.parse(raw);
  const { dms, leadgen } = parseMetaWebhook(body);
  const results: unknown[] = [];
  for (const dm of dms) {
    const id = await recordInbound("instagram", dm.externalId, dm.raw);
    if (id) results.push(await routeInbound(dm, id));
  }
  for (const ref of leadgen) {
    const id = await recordInbound("meta_form", ref.leadgenId, ref);
    if (!id) continue;
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) continue; // recorded; fields can't be fetched until the page token is set
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(ref.leadgenId)}?access_token=${encodeURIComponent(token)}`);
    const data = (await res.json().catch(() => ({}))) as { field_data?: unknown };
    const lead = parseMetaLeadFields(ref.leadgenId, data.field_data);
    if (lead) results.push(await routeInbound(lead, id));
  }
  after(async () => { await runRouting(); });
  return NextResponse.json({ ok: true, processed: results.length });
}
