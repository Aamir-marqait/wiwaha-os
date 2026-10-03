import { hmacHex, safeEqualHex } from "./adapters";
import type { InboundLead } from "./types";

/**
 * Parsers that turn each channel's webhook into one InboundLead shape.
 * They never throw on odd payloads: anything unusable returns null and the
 * route records the raw event for a human to look at.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Best-effort date from "14 March 2027", "14/03/2027", "2027-03-14", "March 14, 2027". Indian day-first order. */
export function parseLooseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => (y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return ok(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return ok(+m[3]! < 100 ? 2000 + +m[3]! : +m[3]!, +m[2]!, +m[1]!);
  m = s.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/);
  if (m && MONTHS[m[2]!]) return ok(+m[3]!, MONTHS[m[2]!]!, +m[1]!);
  m = s.match(/\b([a-z]+)\s+(\d{1,2})\s+(\d{4})\b/);
  if (m && MONTHS[m[1]!]) return ok(+m[3]!, MONTHS[m[1]!]!, +m[2]!);
  return null;
}

export function parseGuestCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, "");
  // Prefer the number next to "guests/people/pax": "300 guests in Dec 2027" → 300, "200-250 guests" → 250.
  const near = s.match(/(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(?:guests?|people|pax|persons?|members)/i);
  if (near) return Number(near[2] ?? near[1]);
  // A bare field ("No. of guests: 200-250"): plan for the upper bound, never a year.
  const nums = [...s.matchAll(/\d+/g)].map((x) => Number(x[0])).filter((n) => n > 0 && n < 5000 && !(n >= 1900 && n <= 2100));
  return nums.length ? Math.max(...nums) : null;
}

const base = (source: InboundLead["source"], externalId: string, raw: unknown): InboundLead => ({
  source, externalId, fullName: null, phone: null, email: null, city: null, dateWanted: null,
  guestCount: null, budgetText: null, message: null, sourceDetail: null, replyTo: null, raw,
});

// ---------------------------------------------------------------------------
// WhatsApp (Gupshup inbound webhook, v2 format)
// ---------------------------------------------------------------------------
export function parseGupshupInbound(body: unknown): InboundLead | null {
  if (!isObj(body) || body.type !== "message" || !isObj(body.payload)) return null;
  const p = body.payload;
  const id = str(p.id);
  const phone = str(p.source) ?? (isObj(p.sender) ? str(p.sender.phone) : null);
  if (!id || !phone) return null;
  const inner = isObj(p.payload) ? p.payload : {};
  const text = str(inner.text) ?? str(inner.caption) ?? (p.type === "location" ? "(shared a location)" : null);
  const lead = base("whatsapp", id, body);
  lead.phone = phone.startsWith("+") ? phone : `+${phone}`;
  lead.fullName = isObj(p.sender) ? str(p.sender.name) : null;
  lead.message = text;
  lead.replyTo = lead.phone;
  lead.dateWanted = parseLooseDate(text);
  return lead;
}

// ---------------------------------------------------------------------------
// Meta: Instagram DMs and Facebook/Instagram lead forms (one webhook)
// ---------------------------------------------------------------------------
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  return safeEqualHex(`sha256=${hmacHex(appSecret, rawBody)}`, header);
}

export interface MetaLeadgenRef { leadgenId: string; formId: string | null; pageId: string | null }

/** Instagram DMs become leads directly; lead-form events need a Graph fetch for their fields. */
export function parseMetaWebhook(body: unknown): { dms: InboundLead[]; leadgen: MetaLeadgenRef[] } {
  const out = { dms: [] as InboundLead[], leadgen: [] as MetaLeadgenRef[] };
  if (!isObj(body) || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    if (!isObj(entry)) continue;
    for (const ev of Array.isArray(entry.messaging) ? entry.messaging : []) {
      if (!isObj(ev) || !isObj(ev.sender) || !isObj(ev.message) || ev.message.is_echo) continue;
      const mid = str(ev.message.mid);
      const sender = str(ev.sender.id);
      if (!mid || !sender) continue;
      const lead = base("instagram", mid, ev);
      lead.message = str(ev.message.text);
      lead.replyTo = sender;
      lead.sourceDetail = "Instagram DM";
      lead.dateWanted = parseLooseDate(lead.message);
      lead.guestCount = /guest|people|pax/i.test(lead.message ?? "") ? parseGuestCount(lead.message) : null;
      out.dms.push(lead);
    }
    for (const ch of Array.isArray(entry.changes) ? entry.changes : []) {
      if (!isObj(ch) || ch.field !== "leadgen" || !isObj(ch.value)) continue;
      const id = str(ch.value.leadgen_id);
      if (id) out.leadgen.push({ leadgenId: id, formId: str(ch.value.form_id), pageId: str(ch.value.page_id) });
    }
  }
  return out;
}

/** Fields of a Meta lead (from GET /{leadgen_id} or a test payload's field_data). */
export function parseMetaLeadFields(leadgenId: string, fieldData: unknown, formName?: string | null): InboundLead | null {
  if (!Array.isArray(fieldData)) return null;
  const f = new Map<string, string>();
  for (const x of fieldData) {
    if (isObj(x) && typeof x.name === "string" && Array.isArray(x.values) && x.values.length) f.set(x.name.toLowerCase(), String(x.values[0]));
  }
  const pick = (...keys: string[]) => { for (const k of keys) { const v = f.get(k); if (v) return v; } return null; };
  const lead = base("meta_form", leadgenId, fieldData);
  lead.fullName = pick("full_name", "name");
  lead.phone = pick("phone_number", "phone");
  lead.email = pick("email");
  lead.city = pick("city");
  lead.dateWanted = parseLooseDate(pick("wedding_date", "event_date", "date"));
  lead.guestCount = parseGuestCount(pick("guest_count", "guests", "number_of_guests"));
  lead.budgetText = pick("budget");
  lead.message = pick("message", "comments", "questions");
  lead.sourceDetail = formName ? `Meta form: ${formName}` : "Meta lead form";
  return lead.phone || lead.email ? lead : null;
}

// ---------------------------------------------------------------------------
// Google Ads lead form extension webhook
// ---------------------------------------------------------------------------
export function parseGoogleAdsLead(body: unknown, expectedKey: string | undefined): InboundLead | null {
  if (!isObj(body) || !expectedKey || body.google_key !== expectedKey) return null;
  const id = str(body.lead_id);
  if (!id || !Array.isArray(body.user_column_data)) return null;
  const f = new Map<string, string>();
  for (const c of body.user_column_data) {
    if (isObj(c) && typeof c.column_id === "string") f.set(c.column_id.toUpperCase(), str(c.string_value) ?? "");
  }
  const lead = base("google_ads", id, body);
  lead.fullName = f.get("FULL_NAME") || [f.get("FIRST_NAME"), f.get("LAST_NAME")].filter(Boolean).join(" ") || null;
  lead.phone = f.get("PHONE_NUMBER") || null;
  lead.email = f.get("EMAIL") || null;
  lead.city = f.get("CITY") || null;
  lead.dateWanted = parseLooseDate(f.get("EVENT_DATE") ?? f.get("WEDDING_DATE"));
  lead.guestCount = parseGuestCount(f.get("GUEST_COUNT") ?? f.get("NUMBER_OF_GUESTS"));
  lead.message = f.get("QUESTION") ?? f.get("COMMENTS") ?? null;
  lead.sourceDetail = `Google Ads lead form${body.campaign_id ? ` (campaign ${String(body.campaign_id)})` : ""}${body.is_test ? " [test]" : ""}`;
  return lead.phone || lead.email ? lead : null;
}

// ---------------------------------------------------------------------------
// WedMeGood: enquiries arrive as emails ("Name: …", "Phone: …" lines).
// ---------------------------------------------------------------------------
export function parseWedMeGoodEmail(email: { messageId: string; from?: string | null; subject?: string | null; text: string }): InboundLead | null {
  const text = email.text.replace(/\r/g, "");
  const field = (...labels: string[]): string | null => {
    for (const label of labels) {
      const m = text.match(new RegExp(`^\\s*${label}\\s*[:\\-–]\\s*(.+)$`, "im"));
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };
  const lead = base("wedmegood", email.messageId, email);
  lead.fullName = field("Name", "Customer Name", "Client Name");
  lead.phone = field("Phone", "Mobile", "Contact Number", "Phone Number");
  lead.email = field("Email", "E-mail", "Email Id");
  lead.city = field("City", "Location");
  lead.dateWanted = parseLooseDate(field("Event Date", "Wedding Date", "Date"));
  lead.guestCount = parseGuestCount(field("Guests", "Guest Count", "No\\. of Guests", "Number of Guests", "Pax"));
  lead.budgetText = field("Budget");
  lead.message = field("Message", "Requirements", "Comments", "Requirement");
  lead.sourceDetail = email.subject ? `WedMeGood: ${email.subject.slice(0, 80)}` : "WedMeGood enquiry";
  return lead.phone || lead.email ? lead : null;
}

/** Shape app.ingest_lead expects (see packages/db/supabase/migrations/…_workflows.sql). */
export function toIngestPayload(l: InboundLead): Record<string, string | number | boolean | null> {
  return {
    full_name: l.fullName ?? (l.source === "instagram" ? "Instagram enquiry" : "New enquiry"),
    phone_e164: l.phone,
    email: l.email,
    source: l.source,
    source_detail: l.sourceDetail,
    city: l.city,
    date_wanted: l.dateWanted,
    guest_count: l.guestCount,
    budget_text: l.budgetText,
    message: l.message,
    external_ref: `${l.source}:${l.externalId}`,
    reply_to: l.replyTo,
    consent_whatsapp: l.source === "whatsapp",
  };
}
