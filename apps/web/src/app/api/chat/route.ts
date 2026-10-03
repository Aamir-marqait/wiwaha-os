import { after, NextResponse, type NextRequest } from "next/server";
import { normalisePhone } from "@wiwaha/db";
import { parseLooseDate, type InboundLead } from "@wiwaha/integrations";
import { runRouting } from "@/lib/agents";
import { recordInbound, routeInbound } from "@/lib/inbound";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_MESSAGES = 30;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

async function session(token: string | null) {
  if (!token || token.length < 20) return null;
  const { data } = await createAdminClient("public").from("chat_sessions").select("*").eq("token", token).maybeSingle();
  return data as { id: string; token: string; lead_id: string | null; visitor_name: string | null; visitor_phone: string | null; visitor_email: string | null } | null;
}

/** The visitor's conversation: their messages and replies the team has sent. */
export async function GET(req: NextRequest) {
  const s = await session(req.nextUrl.searchParams.get("token"));
  if (!s?.lead_id) return NextResponse.json({ messages: [] }, { headers: cors });
  const { data } = await createAdminClient("public").from("messages").select("id, direction, body, status, created_at, sent_at")
    .eq("lead_id", s.lead_id).eq("channel", "web_chat").order("created_at");
  const visible = (data ?? []).filter((m) => m.direction === "inbound" || m.status === "sent");
  return NextResponse.json({ messages: visible.map((m) => ({ id: m.id, from: m.direction === "inbound" ? "you" : "wiwaha", body: m.body, at: m.sent_at ?? m.created_at })) }, { headers: cors });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { action?: string; token?: string; name?: string; phone?: string; email?: string; message?: string } | null;
  const text = (b?.message ?? "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "Please type a message." }, { status: 400, headers: cors });
  const db = createAdminClient("public");

  let s = b?.action === "message" ? await session(b.token ?? null) : null;
  if (b?.action === "message" && !s) return NextResponse.json({ error: "Chat not found. Please start again." }, { status: 404, headers: cors });
  if (!s) {
    const phone = normalisePhone(b?.phone);
    const email = b?.email?.trim() || null;
    if (!b?.name?.trim() || (!phone && !email)) return NextResponse.json({ error: "Please share your name and a phone number or email so we can reply." }, { status: 400, headers: cors });
    const { data, error } = await db.from("chat_sessions").insert({ visitor_name: b.name.trim().slice(0, 80), visitor_phone: phone, visitor_email: email }).select("*").single();
    if (error) return NextResponse.json({ error: "We couldn't start the chat. Please call us." }, { status: 500, headers: cors });
    s = data;
  } else {
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("lead_id", s.lead_id ?? "").eq("channel", "web_chat").eq("direction", "inbound");
    if ((count ?? 0) >= MAX_MESSAGES) return NextResponse.json({ error: "Our team will continue this with you by phone." }, { status: 429, headers: cors });
  }

  const lead: InboundLead = {
    source: "web_chat", externalId: `${s!.id}:${Date.now()}`, fullName: s!.visitor_name, phone: s!.visitor_phone, email: s!.visitor_email,
    city: null, dateWanted: parseLooseDate(text), guestCount: null, budgetText: null, message: text, sourceDetail: "Website chat", replyTo: s!.id, raw: { text },
  };
  const eventId = await recordInbound("web_chat", lead.externalId, { session: s!.id, text });
  const { leadId } = eventId ? await routeInbound(lead, eventId) : { leadId: s!.lead_id };
  if (leadId) {
    if (!s!.lead_id) await db.from("chat_sessions").update({ lead_id: leadId }).eq("id", s!.id);
    await db.from("messages").insert({ lead_id: leadId, channel: "web_chat", direction: "inbound", status: "received", author_kind: "contact", body: text, metadata: { chat_session: s!.id } });
    await db.from("chat_sessions").update({ last_message_at: new Date().toISOString() }).eq("id", s!.id);
  }
  after(async () => { await runRouting(); });
  return NextResponse.json({ ok: true, token: s!.token }, { headers: cors });
}
