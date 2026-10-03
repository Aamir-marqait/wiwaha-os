import type { Json } from "@wiwaha/db";
import { formatDateIST, rupees } from "@wiwaha/db";
import { isOutOfTown, startingFromBand, type PolicyBook, type PolicyKey } from "@wiwaha/policy";
import { nearbyFreeDates, freeSpacesOn } from "../../domain/calendar";
import { bookVisit, findSlots, formatSlot, type Slot } from "../../domain/visits";
import { where, type Db } from "../../framework/db";
import { agentDb, alertStaff, istDate, proposeClientMessage, writeText } from "../../framework/kit";
import { runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { VOICE_GATE } from "./gate";
import { detectLanguage, PHRASES, SPEECH_LOCALE, type VoiceLang } from "./phrases";
import { VOICE_TOOLS } from "./tools";

export const VOICE_CONCIERGE = "voice_concierge";
export const VOICE_POLICIES: readonly PolicyKey[] = [
  "honesty.commitments", "pricing.phone", "discounts", "venue.facts", "visits.booking", "voice.concierge", "followup.after_visit", "languages", "holds.soft_hold",
];

// ---------------------------------------------------------------------------
// Call state (stored in calls.state)
// ---------------------------------------------------------------------------
export interface Turn { who: "caller" | "agent"; text: string; at: string }
export interface CallState {
  turns: Turn[];
  language: VoiceLang;
  intents: string[];
  stage: "open" | "awaiting_city" | "offering_slot" | "awaiting_name" | "follow_up" | "closing";
  pendingIntent?: "price" | null;
  city?: string | null;
  outOfTown?: boolean | null;
  offeredSlot?: Slot | null;
  dateAsked?: string | null;
  callerName?: string | null;
  visitId?: string | null;
  unknowns?: string[];
  transfer?: { reason: string; at: string } | null;
  brochureSent?: boolean;
}

export interface VoiceReply {
  say: string;
  action: "continue" | "transfer" | "hangup";
  language: VoiceLang;
  speechLocale: string;
  transferTo?: string | null;
}

type Intent = "price" | "discount" | "availability" | "visit" | "person" | "upset" | "rooms" | "airport" | "catering" | "capacity" | "yes" | "no" | "bye" | "city";

const PATTERNS: Record<Exclude<Intent, "city">, RegExp> = {
  price: /\b(price|pricing|cost|costs|rate|rates|charges?|how much|package|budget|tariff|kitna|bele|ಬೆಲೆ|ದರ|कीमत|दाम|खर्च)\b|ಎಷ್ಟು|कितना/i,
  discount: /\b(discount|cheaper|lower|negotiat\w*|best (price|rate|deal)|deal|offer|concession|kam karo|ರಿಯಾಯಿತಿ|छूट)\b/i,
  availability: /\b(availab\w*|free on|open on|is .* (free|open)|book(ed)? on|date)\b|ಲಭ್ಯ|खाली|उपलब्ध/i,
  visit: /\b(visit|come (and|to) see|see the (venue|place|estate)|tour|walk ?through|site visit|come over|drop by)\b|ಭೇಟಿ|देखने/i,
  person: /\b(human|person|someone|real person|manager|speak to|talk to|agent|representative|call me back|executive)\b|ಮನುಷ್ಯ|ಯಾರಾದರೂ|किसी से बात|इंसान/i,
  upset: /\b(ridiculous|useless|angry|frustrated|worst|cheat\w*|nonsense|pathetic|stupid|waste of time|fed up|disgusting)\b|!!/i,
  rooms: /\b(rooms?|stay|accommodat\w*|overnight)\b|ಕೊಠಡಿ|कमरे/i,
  airport: /\b(airport|how far|distance|location|where are you|directions)\b|ವಿಮಾನ|एयरपोर्ट/i,
  catering: /\b(catering|caterer|food|menu|cuisine|veg|non-?veg)\b|ಅಡುಗೆ|खाना/i,
  capacity: /\b(capacity|how many (guests|people)|accommodate \d+|seat\w*|hold \d+|\d+\s*(guests|people|pax))\b/i,
  yes: /^(yes|yeah|yep|sure|ok(ay)?|go ahead|please do|book it|fine|perfect|haan|ha|ji|houdu|sari|ಹೌದು|ಸರಿ|हाँ|ठीक)\b/i,
  no: /^(no|nope|not now|later|nahi|beda|ಬೇಡ|नहीं)\b/i,
  bye: /\b(bye|goodbye|that'?s all|nothing else|thank you,? bye|ok thanks|dhanyavada|shukriya)\b/i,
};

export function detectVoiceIntents(text: string): Intent[] {
  return (Object.keys(PATTERNS) as (keyof typeof PATTERNS)[]).filter((k) => PATTERNS[k].test(text.trim()));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Spoken dates: "14th March", "March 14", "14/3", with or without a year (next occurrence). */
export function parseSpokenDate(text: string, today: string): string | null {
  const s = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  let day: number | null = null, month: number | null = null, year: number | null = null;
  let m = s.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/);
  if (m) { day = +m[1]!; month = MONTHS[m[2]!]!; year = m[3] ? +m[3] : null; }
  if (!m) { m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/); if (m) { month = MONTHS[m[1]!]!; day = +m[2]!; year = m[3] ? +m[3] : null; } }
  if (!m) { m = s.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/); if (m) { day = +m[1]!; month = +m[2]!; year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null; } }
  if (!day || !month || month > 12 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [ty] = today.split("-").map(Number);
  let y = year ?? ty!;
  let iso = `${y}-${pad(month)}-${pad(day)}`;
  if (!year && iso < today) { y += 1; iso = `${y}-${pad(month)}-${pad(day)}`; }
  return iso;
}

const PINCODE = /\b(5[0-9]{5})\b/;
/** Bengaluru urban/rural and Devanahalli pincodes count as local. */
export function isLocalPincode(pin: string): boolean {
  return /^56[0-2]\d{3}$/.test(pin);
}

function guessCity(text: string): string | null {
  const m = text.match(/\b(?:from|in|based in|live in|staying in|we are in|i am in|i'm in)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/);
  if (m) return m[1]!;
  const bare = text.trim().replace(/[.!?]$/, "");
  return /^[A-Za-z][A-Za-z ]{2,24}$/.test(bare) && bare.split(" ").length <= 2 ? bare : null;
}

// ---------------------------------------------------------------------------
// One conversational turn
// ---------------------------------------------------------------------------
async function loadCall(db: Db, callId: string) {
  const [call] = await db.select<{ id: string; lead_id: string | null; visit_id: string | null; purpose: string | null; from_number: string | null; to_number: string | null; direction: string; state: CallState | Record<string, never>; language: string | null }>("calls", { where: { id: callId } });
  if (!call) throw new Error(`Call ${callId} not found`);
  const state: CallState = { turns: [], language: "en", intents: [], stage: call.purpose === "follow_up" ? "follow_up" : "open", unknowns: [], ...(call.state as Partial<CallState>) };
  return { call, state };
}

function reply(state: CallState, say: string, action: VoiceReply["action"] = "continue", transferTo: string | null = null): VoiceReply {
  return { say, action, language: state.language, speechLocale: SPEECH_LOCALE[state.language], transferTo };
}

/** Greeting for a new inbound call (or the follow-up opener for an outbound one). */
export async function voiceStart(deps: AgentDeps, callId: string): Promise<RunOutcome<VoiceReply>> {
  return runAgent(deps, VOICE_CONCIERGE, { action: "call_start", input: { call_id: callId }, fallbackTitle: "Answer a phone call" }, async (ctx) => {
    const db = agentDb(ctx, VOICE_TOOLS);
    const { call, state } = await loadCall(db, callId);
    const rules = ctx.book.get("voice.concierge");
    let say = PHRASES[state.language].greeting(rules.announce_recording && rules.record_calls);
    if (state.stage === "follow_up") {
      const [lead] = call.lead_id ? await db.select<{ contact_id: string }>("leads", { where: { id: call.lead_id } }) : [];
      const [contact] = lead ? await db.select<{ full_name: string }>("contacts", { where: { id: lead.contact_id } }) : [];
      say = PHRASES[state.language].followUpOpen(contact?.full_name?.split(" ")[0] ?? "");
    }
    state.turns.push({ who: "agent", text: say, at: ctx.now.toISOString() });
    await db.update("calls", { id: callId }, { state: state as unknown as Json, status: "in_progress" });
    await ctx.log({ action: "call_start", status: "ok", leadId: call.lead_id, input: { call_id: callId, purpose: call.purpose }, output: { say }, toolsUsed: ["calls"] });
    return reply(state, say);
  });
}

export async function voiceTurn(deps: AgentDeps, callId: string, utterance: string): Promise<RunOutcome<VoiceReply>> {
  return runAgent(deps, VOICE_CONCIERGE, { action: "call_turn", input: { call_id: callId, utterance }, fallbackTitle: "A caller is waiting on the phone" }, async (ctx) => {
    const db = agentDb(ctx, VOICE_TOOLS);
    const { call, state } = await loadCall(db, callId);
    const text = utterance.trim();
    state.turns.push({ who: "caller", text, at: ctx.now.toISOString() });
    const lang = detectLanguage(text);
    if (lang && ctx.book.get("languages").voice.includes(lang)) state.language = lang;
    const intents = detectVoiceIntents(text);
    state.intents = [...new Set([...state.intents, ...intents])];
    const today = istDate(ctx.now);

    const out = await decide(ctx, db, call, state, text, intents, today);
    state.turns.push({ who: "agent", text: out.say, at: ctx.now.toISOString() });
    await db.update("calls", { id: callId }, { state: state as unknown as Json, language: state.language, ...(out.action === "transfer" ? { handed_over: true } : {}) });
    await ctx.log({
      action: "call_turn", status: out.action === "transfer" ? "escalated" : "ok", leadId: call.lead_id,
      input: { utterance: text, intents, stage: state.stage }, output: { say: out.say, action: out.action, language: state.language },
      toolsUsed: [...VOICE_TOOL_NAMES], policyKeys: [...VOICE_POLICIES], policyVersions: ctx.book.versions(VOICE_POLICIES),
    });
    return out;
  });
}

const VOICE_TOOL_NAMES = Object.keys(VOICE_TOOLS.tables);

async function decide(ctx: RunContext, db: Db, call: Awaited<ReturnType<typeof loadCall>>["call"], state: CallState, text: string, intents: Intent[], today: string): Promise<VoiceReply> {
  const P = PHRASES[state.language];
  const rules = ctx.book.get("voice.concierge");
  const venue = ctx.book.get("venue.facts");

  // 0. A person asked for, or an upset caller: hand over immediately.
  if (intents.includes("person") || intents.includes("upset")) {
    const reason = intents.includes("upset") ? "upset" : "asked_for_person";
    if (rules.transfer_on.includes(reason)) return transfer(ctx, db, call, state, reason);
  }

  // Follow-up call: log what they said, thank them, close.
  if (state.stage === "follow_up") {
    const outcome = intents.includes("no") || /not interested|booked (somewhere|elsewhere)|another venue/i.test(text) ? "reached_not_interested"
      : intents.includes("yes") || /interested|book|go ahead|next step|second visit/i.test(text) ? "reached_interested" : "reached_undecided";
    if (call.visit_id) await db.update("visits", { id: call.visit_id }, { follow_up_outcome: outcome, follow_up_done_at: ctx.now.toISOString() });
    if (call.lead_id) await db.update("leads", { id: call.lead_id }, { status: "follow_up_done" });
    if (call.lead_id && outcome === "reached_interested") {
      await alertStaff(ctx.deps, { role: "sales", title: "Follow-up call: the family is interested", body: text.slice(0, 200), link: `/team/leads/${call.lead_id}`, leadId: call.lead_id, whatsapp: true });
    }
    state.stage = "closing";
    return reply(state, `${P.followUpThanks} ${P.goodbye}`, "hangup");
  }

  // 1. Waiting for a city (price question pending).
  if (state.stage === "awaiting_city") {
    const pin = text.match(PINCODE)?.[1];
    const city = pin ? null : guessCity(text);
    if (pin || city) {
      state.city = pin ?? city;
      state.outOfTown = pin ? !isLocalPincode(pin) : isOutOfTown(ctx.book, city);
      state.stage = "open";
      if (call.lead_id && city) await db.update("leads", { id: call.lead_id }, { city });
      return answerPrice(ctx, db, call, state, today);
    }
  }

  // 2. Waiting for a name to complete a booking.
  if (state.stage === "awaiting_name" && state.offeredSlot) {
    const name = text.replace(/^(my name is|i am|i'm|this is|it's|naanu|mera naam)\s+/i, "").replace(/[.!]$/, "").trim();
    if (name.length >= 2 && name.length <= 60) {
      state.callerName = name;
      return confirmBooking(ctx, db, call, state, today);
    }
  }

  // 3. Answering a slot offer.
  if (state.stage === "offering_slot" && state.offeredSlot) {
    if (intents.includes("yes")) {
      if (!call.lead_id && !state.callerName) { state.stage = "awaiting_name"; return reply(state, P.askName); }
      return confirmBooking(ctx, db, call, state, today);
    }
    if (intents.includes("no")) { state.stage = "open"; state.offeredSlot = null; return reply(state, P.anythingElse); }
  }

  if (intents.includes("bye") && intents.length === 1) { state.stage = "closing"; return reply(state, P.goodbye, "hangup"); }

  const parts: string[] = [];
  let handled = false;

  // 4. Dates: honest availability, with nearby open dates when taken.
  const date = parseSpokenDate(text, today);
  if (date) {
    handled = true;
    state.dateAsked = date;
    const guests = Number(text.match(/(\d{2,4})\s*(guests|people|pax)/i)?.[1]) || null;
    const free = await freeSpacesOn(db, date, guests, ctx.now);
    const label = formatDateIST(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (free.length) parts.push(P.dateFree(label));
    else {
      const alt = await nearbyFreeDates(db, date, guests, ctx.now);
      parts.push(alt.length ? P.dateTaken(label, alt.map((d) => formatDateIST(d, { day: "numeric", month: "long" })).join(", ")) : P.dateTakenNoAlternatives(label));
    }
    if (call.lead_id) await db.update("leads", { id: call.lead_id }, { date_wanted: date, ...(guests ? { guest_count: guests } : {}) });
  }

  // 5. Venue facts, straight from the policy book.
  if (intents.includes("rooms")) { handled = true; parts.push(P.rooms(venue.rooms_now, venue.complimentary_rooms_with_booking)); }
  if (intents.includes("airport")) { handled = true; parts.push(P.airport(venue.airport_distance_km)); }
  if (intents.includes("catering")) { handled = true; parts.push(P.catering(venue.catering.join(", "), venue.outside_caterer_allowed)); }
  if (intents.includes("capacity")) {
    handled = true;
    const spaces = await db.select<{ capacity_seated: number }>("spaces", { where: { active: true } });
    parts.push(P.capacity(Math.max(0, ...spaces.map((s) => s.capacity_seated))));
  }

  // 6. Discounts: never promised; Prashanth decides.
  if (intents.includes("discount")) {
    handled = true;
    parts.push(P.discount);
    await ctx.deps.store.queueHuman({ agentKey: VOICE_CONCIERGE, reason: "escalation", assignedRole: VOICE_GATE.discountsTo, leadId: call.lead_id, title: "A caller asked for a discount", detail: `On the phone: "${text}". Only Prashanth decides discounts.` });
  }

  // 7. Price: never on the phone for local callers; band only for out-of-town.
  if (intents.includes("price")) {
    handled = true;
    if (state.outOfTown === undefined || state.outOfTown === null) {
      state.stage = "awaiting_city";
      state.pendingIntent = "price";
      return reply(state, [...parts, P.askCity].join(" "));
    }
    const priced = await answerPrice(ctx, db, call, state, today);
    return reply(state, [...parts, priced.say].join(" "));
  }

  // 8. Visit (or anything that ended in a positive note): offer a slot.
  if (intents.includes("visit") || (handled && date)) {
    const offer = await offerSlot(ctx, db, state, date ?? today);
    return reply(state, [...parts, offer].join(" "));
  }

  if (handled) return reply(state, [...parts, P.anythingElse].join(" "));

  // 9. Not in the policy book: never guess. Create a task and say so.
  if (text.length < 2) return reply(state, P.didNotCatch);
  state.unknowns = [...(state.unknowns ?? []), text];
  await ctx.deps.store.queueHuman({
    agentKey: VOICE_CONCIERGE, reason: "off_policy", assignedRole: VOICE_GATE.unknownsTo, leadId: call.lead_id,
    title: "Caller asked something the concierge couldn't answer", detail: `"${text}" (call ${call.id}). Please call them back.`,
  });
  return reply(state, `${P.unknown} ${P.anythingElse}`);
}

async function answerPrice(ctx: RunContext, db: Db, call: { id: string; lead_id: string | null; from_number: string | null }, state: CallState, today: string): Promise<VoiceReply> {
  const P = PHRASES[state.language];
  if (!state.outOfTown) {
    const offer = await offerSlot(ctx, db, state, today);
    return reply(state, `${P.priceLocal} ${offer}`);
  }
  const band = startingFromBand(ctx.book);
  const pricing = ctx.book.get("pricing.phone");
  if (!state.brochureSent && call.from_number && (pricing.send_brochure || pricing.send_video_tour)) {
    state.brochureSent = true;
    await proposeClientMessage(ctx, {
      channel: "whatsapp", to: call.from_number, leadId: call.lead_id, approvalKind: "client_message",
      title: "Brochure and video tour for an out-of-town caller",
      body: `Namaste from Wiwaha by Praman! As promised on the phone, here is our brochure${pricing.send_video_tour ? " and a video tour of the estate" : ""}. ${band ? `Celebrations here start from ${rupees(band.paise)}. ` : ""}We'd love to set up a video call with the team whenever suits you.\n\nWarmly,\nTeam Wiwaha`,
      payload: { attachments: ["brochure", ...(pricing.send_video_tour ? ["video_tour"] : [])] },
    });
  }
  if (band) return reply(state, P.priceBand(rupees(band.paise)));
  await ctx.deps.store.queueHuman({ agentKey: VOICE_CONCIERGE, reason: "off_policy", assignedRole: "owner", leadId: call.lead_id, title: `Out-of-town caller (${state.city ?? "unknown city"}) asked for a starting price`, detail: "No starting-from band is approved in the policy book yet. Approve one or call them back." });
  return reply(state, P.priceNoBand);
}

async function offerSlot(ctx: RunContext, db: Db, state: CallState, fromDate: string): Promise<string> {
  const P = PHRASES[state.language];
  // Visits are offered from today, whatever date the wedding is.
  void fromDate;
  const [slot] = await findSlots(db, ctx.book, ctx.now, istDate(ctx.now), 7, 1);
  if (!slot) { state.stage = "open"; return P.noSlots; }
  state.offeredSlot = slot;
  state.stage = "offering_slot";
  return P.offerSlot(formatSlot(slot.startsAt, state.language === "en" ? "en-IN" : `${state.language}-IN`));
}

async function confirmBooking(ctx: RunContext, db: Db, call: { id: string; lead_id: string | null; from_number: string | null }, state: CallState, today: string): Promise<VoiceReply> {
  const P = PHRASES[state.language];
  const slot = state.offeredSlot!;
  let leadId = call.lead_id;
  if (!leadId) {
    const rows = await db.rpc<{ lead_id: string }[]>("ingest_lead", {
      p: { full_name: state.callerName ?? "Phone caller", phone_e164: call.from_number, source: "phone", source_detail: "Voice Concierge", city: state.city ?? null, date_wanted: state.dateAsked ?? null, message: state.turns.filter((t) => t.who === "caller").map((t) => t.text).join(" ").slice(0, 1000) },
    });
    leadId = rows[0]?.lead_id ?? null;
    if (leadId) await db.update("calls", { id: call.id }, { lead_id: leadId });
  }
  if (!leadId) return reply(state, P.unknown);
  try {
    const { visitId } = await bookVisit(db, ctx.book, { leadId, slot, bookedByAgent: VOICE_CONCIERGE, notes: "Booked on the phone by the Voice Concierge" });
    state.visitId = visitId;
    state.stage = "open";
    state.offeredSlot = null;
    return reply(state, `${P.booked(formatSlot(slot.startsAt, state.language === "en" ? "en-IN" : `${state.language}-IN`))} ${P.anythingElse}`);
  } catch {
    // Someone took the slot a moment ago (the DB refuses double-booking): offer the next one.
    const next = await offerSlot(ctx, db, state, today);
    return reply(state, next);
  }
}

async function transfer(ctx: RunContext, db: Db, call: { id: string; lead_id: string | null; from_number: string | null }, state: CallState, reason: string): Promise<VoiceReply> {
  const P = PHRASES[state.language];
  const rules = ctx.book.get("voice.concierge");
  state.transfer = { reason, at: ctx.now.toISOString() };
  let to = rules.transfer_number_e164;
  if (!to) {
    const [person] = await db.select<{ phone_e164: string | null }>("profiles", { where: { role: rules.transfer_to_role, active: true, phone_e164: where.notNull() }, limit: 1 });
    to = person?.phone_e164 ?? null;
  }
  if (to) return reply(state, P.transfer, "transfer", to);
  // Nobody to transfer to: promise a callback and make it an urgent task.
  await callbackTask(ctx, db, call, reason);
  state.stage = "closing";
  return reply(state, `${P.callback(rules.callback_within_minutes)} ${P.goodbye}`, "hangup");
}

/** Called when a transfer isn't answered, or nobody is configured to take it. */
export async function callbackTask(ctx: RunContext, db: Db, call: { id: string; lead_id: string | null; from_number: string | null }, reason: string): Promise<void> {
  const rules = ctx.book.get("voice.concierge");
  const due = new Date(ctx.now.getTime() + rules.callback_within_minutes * 60_000).toISOString();
  await db.insert("tasks", {
    scope: "sales", lead_id: call.lead_id, title: `Call back ${call.from_number ?? "the caller"} (${reason.replace(/_/g, " ")})`,
    owner_role: rules.transfer_to_role, due_at: due, priority: "urgent", proof_kind: "tick", buffer_hours: 0, created_by_agent: VOICE_CONCIERGE,
  });
  await alertStaff(ctx.deps, { role: rules.transfer_to_role, title: "Urgent: call back a caller", body: `${call.from_number ?? "A caller"} wanted a person (${reason.replace(/_/g, " ")}). Promised a callback within ${rules.callback_within_minutes} minutes.`, link: call.lead_id ? `/team/leads/${call.lead_id}` : "/team", leadId: call.lead_id, whatsapp: true });
}

export async function transferFailed(deps: AgentDeps, callId: string): Promise<RunOutcome<VoiceReply>> {
  return runAgent(deps, VOICE_CONCIERGE, { action: "transfer_failed", input: { call_id: callId }, fallbackTitle: "Call back a caller" }, async (ctx) => {
    const db = agentDb(ctx, VOICE_TOOLS);
    const { call, state } = await loadCall(db, callId);
    await callbackTask(ctx, db, call, state.transfer?.reason ?? "asked_for_person");
    const P = PHRASES[state.language];
    const say = `${P.callback(ctx.book.get("voice.concierge").callback_within_minutes)} ${P.goodbye}`;
    state.turns.push({ who: "agent", text: say, at: ctx.now.toISOString() });
    await db.update("calls", { id: callId }, { state: state as unknown as Json });
    await ctx.log({ action: "transfer_failed", status: "escalated", leadId: call.lead_id, input: { call_id: callId }, output: { say } });
    return reply(state, say, "hangup");
  });
}

// ---------------------------------------------------------------------------
// Call wrap-up: transcript, summary, recording on the lead.
// ---------------------------------------------------------------------------
export async function finishCall(deps: AgentDeps, callId: string, opts: { durationSeconds?: number | null; recordingUrl?: string | null; status?: "completed" | "no_answer" | "failed" | "transferred" } = {}): Promise<RunOutcome<{ summary: string }>> {
  return runAgent(deps, VOICE_CONCIERGE, { action: "call_finish", input: { call_id: callId }, fallbackTitle: "Summarise a phone call" }, async (ctx) => {
    const db = agentDb(ctx, VOICE_TOOLS);
    const { call, state } = await loadCall(db, callId);
    const transcript = state.turns.map((t) => `${t.who === "caller" ? "Caller" : "Wiwaha"}: ${t.text}`).join("\n");
    const template = [
      `${call.direction === "outbound" ? "Outbound" : "Inbound"} call${state.language !== "en" ? ` in ${state.language}` : ""}.`,
      state.intents.length ? `Asked about: ${state.intents.filter((i) => !["yes", "no", "bye"].includes(i)).join(", ") || "general enquiry"}.` : "",
      state.visitId ? "A site visit was booked." : "",
      state.transfer ? `Transferred to the team (${state.transfer.reason.replace(/_/g, " ")}).` : "",
      state.unknowns?.length ? `Needs a callback on: ${state.unknowns.join("; ")}.` : "",
    ].filter(Boolean).join(" ");
    const summary = state.turns.length > 1
      ? await writeText(ctx, { policies: [], facts: { transcript, booked_visit: !!state.visitId, transferred: !!state.transfer }, task: "Summarise this call for the sales team in 2-3 plain sentences: who called, what they wanted, what was promised, what happens next. Only facts from the transcript.", template, clientFacing: false, maxTokens: 300 })
      : null;
    const outcome = opts.status === "no_answer" ? "no answer" : state.visitId ? "visit booked" : state.transfer ? "transferred" : state.unknowns?.length ? "callback needed" : "answered";
    await db.update("calls", { id: callId }, {
      transcript, summary: summary?.body ?? template, outcome, status: opts.status ?? (state.transfer ? "transferred" : "completed"),
      ended_at: ctx.now.toISOString(), duration_seconds: opts.durationSeconds ?? null, recording_url: opts.recordingUrl ?? null,
    });
    // A follow-up call nobody answered: the policy says stop calling.
    if (call.purpose === "follow_up" && opts.status === "no_answer" && call.visit_id) {
      await db.update("visits", { id: call.visit_id, follow_up_outcome: "pending" }, { follow_up_outcome: "no_response", follow_up_done_at: ctx.now.toISOString() });
      if (call.lead_id) await db.update("leads", { id: call.lead_id }, { status: "no_response" });
    }
    await ctx.log({ action: "call_finish", status: "ok", leadId: call.lead_id, input: { call_id: callId, status: opts.status ?? null }, output: { summary: summary?.body ?? template, outcome }, model: summary?.model ?? null, inputTokens: summary?.inputTokens ?? null, outputTokens: summary?.outputTokens ?? null, costUsdMicros: summary?.costUsdMicros ?? null });
    return { summary: summary?.body ?? template };
  });
}

// ---------------------------------------------------------------------------
// The single follow-up call, two days after a visit. The unique index
// calls_one_follow_up_per_visit makes a second call impossible.
// ---------------------------------------------------------------------------
export async function placeFollowUpCalls(deps: AgentDeps): Promise<RunOutcome<{ placed: number }>> {
  return runAgent(deps, VOICE_CONCIERGE, { action: "follow_up_calls", input: {}, fallbackTitle: "Make follow-up calls after site visits" }, async (ctx) => {
    const db = agentDb(ctx, VOICE_TOOLS);
    const policy = ctx.book.get("followup.after_visit");
    if (policy.calls < 1) return { placed: 0 };
    const due = await db.select<{ id: string; lead_id: string; follow_up_due_at: string | null }>("visits", {
      where: { status: "completed", follow_up_outcome: "pending", follow_up_due_at: where.lte(ctx.now.toISOString()), follow_up_call_id: where.isNull() }, limit: 20,
    });
    let placed = 0;
    for (const v of due) {
      const existing = await db.select("calls", { where: { visit_id: v.id, purpose: "follow_up" } });
      if (existing.length >= policy.calls) continue;
      const [lead] = await db.select<{ contact_id: string; status: string }>("leads", { where: { id: v.lead_id } });
      if (!lead || ["won", "lost", "no_response"].includes(lead.status)) continue;
      const [contact] = await db.select<{ phone_e164: string | null; consent_calls: boolean }>("contacts", { where: { id: lead.contact_id } });
      if (!contact?.phone_e164 || contact.consent_calls === false) {
        await db.update("visits", { id: v.id }, { follow_up_outcome: "not_required" });
        continue;
      }
      let call: { id: string } | undefined;
      try {
        [call] = await db.insert<{ id: string }>("calls", { lead_id: v.lead_id, visit_id: v.id, direction: "outbound", purpose: "follow_up", handled_by: "agent", agent_key: VOICE_CONCIERGE, to_number: contact.phone_e164, status: "ringing", state: { turns: [], language: "en", intents: [], stage: "follow_up" } });
      } catch {
        continue; // unique index: this visit already had its one follow-up call
      }
      await db.update("visits", { id: v.id }, { follow_up_call_id: call!.id });
      const channels = ctx.deps.channels;
      if (channels) {
        const res = await channels.telephony.placeCall({ to: contact.phone_e164, answerUrl: channels.voiceUrl("/api/voice/answer", { call: call!.id }), statusUrl: channels.voiceUrl("/api/voice/status", { call: call!.id }), purpose: "follow_up", record: ctx.book.get("voice.concierge").record_calls });
        await db.update("calls", { id: call!.id }, { provider_ref: res.providerRef, status: res.status === "failed" ? "failed" : "ringing" });
        await db.insert("outbox", { kind: "call", provider: res.provider, to_address: contact.phone_e164, status: res.status, provider_ref: res.providerRef, error: res.error ?? null, lead_id: v.lead_id, subject_table: "calls", subject_id: call!.id, sent_at: ctx.now.toISOString() });
      }
      placed++;
    }
    await ctx.log({ action: "follow_up_calls", status: "ok", input: {}, output: { placed, due: due.length }, policyKeys: ["followup.after_visit"], policyVersions: ctx.book.versions(["followup.after_visit"]) });
    return { placed };
  });
}

/** Opens a call row for an inbound call (or the simulator). */
export async function openInboundCall(deps: AgentDeps, input: { from: string | null; to?: string | null; providerRef?: string | null }): Promise<{ callId: string; leadId: string | null }> {
  const db = deps.db!;
  let leadId: string | null = null;
  if (input.from) {
    const contacts = await db.select<{ id: string }>("contacts", { where: { phone_e164: input.from } });
    if (contacts[0]) {
      const [lead] = await db.select<{ id: string }>("leads", { where: { contact_id: contacts[0].id }, order: [{ column: "last_touch_at", ascending: false }], limit: 1 });
      leadId = lead?.id ?? null;
    }
  }
  const [call] = await db.insert<{ id: string }>("calls", { lead_id: leadId, direction: "inbound", purpose: "enquiry", handled_by: "agent", agent_key: VOICE_CONCIERGE, from_number: input.from, to_number: input.to ?? null, provider_ref: input.providerRef ?? null, status: "in_progress", state: {} });
  return { callId: call!.id, leadId };
}
