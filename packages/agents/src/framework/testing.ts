import { randomUUID } from "node:crypto";
import { createIntegrations } from "@wiwaha/integrations";
import { MemoryDb, type Row } from "./db";
import { NoLlm } from "./llm";
import { MemoryAgentStore } from "./memory-store";
import type { AgentDeps, LlmClient } from "./types";

/**
 * A small in-memory Wiwaha for agent scenario tests: the seed policy book and
 * roster (MemoryAgentStore), a MemoryDb with spaces, rooms, staff and the
 * constraints that matter, sandboxed channels, and a stand-in for
 * app.ingest_lead (dedupe by phone).
 */
export const T_NOW = new Date("2026-10-03T04:30:00Z"); // Saturday 3 Oct 2026, 10:00 am IST

export const STAFF = {
  owner: { id: "u-owner", full_name: "Prashanth", role: "owner", phone_e164: "+919800000001", active: true },
  sales: { id: "u-sales", full_name: "Kavya Shetty", role: "sales", phone_e164: "+919800000002", active: true },
  em: { id: "u-em", full_name: "Arjun Menon", role: "event_manager", phone_e164: "+919800000003", active: true },
  staff: { id: "u-staff", full_name: "Manjunath", role: "staff", phone_e164: "+919800000004", active: true },
  accounts: { id: "u-acc", full_name: "Lakshmi Rao", role: "accounts", phone_e164: "+919800000005", active: true },
} as const;

export function testWorld(opts: { llm?: LlmClient; now?: Date; seed?: Record<string, Row[]> } = {}) {
  const now = opts.now ?? T_NOW;
  const store = new MemoryAgentStore();
  const db = new MemoryDb({
    profiles: Object.values(STAFF).map((p) => ({ ...p })),
    spaces: [
      { id: "sp-lawn", name: "The Grand Lawn", capacity_seated: 600, active: true, sort: 10 },
      { id: "sp-pav", name: "The Pavilion", capacity_seated: 400, active: true, sort: 30 },
      { id: "sp-hall", name: "Sage Hall", capacity_seated: 200, active: true, sort: 40 },
    ],
    exec_availability: [],
    exec_time_off: [],
    calendar_entries: [],
    ...opts.seed,
  });
  db.now = () => now;
  db.unique("calls", "visit_id", "purpose"); // calls_one_follow_up_per_visit
  // moodboards_guard_unlock: no décor work before the contract (40%) payment.
  db.beforeInsert("moodboards", (r, d) => {
    if (!d.rows("payments").some((p) => p.wedding_id === r.wedding_id && p.milestone === "contract" && p.status === "paid")) {
      throw Object.assign(new Error("Décor opens after: contract paid"), { code: "P0001" });
    }
  });
  db.beforeInsert("vendor_bookings", (r) => { r.reply_token ??= randomUUID().replace(/-/g, ""); r.chase_count ??= 0; r.requested_at ??= now.toISOString(); r.replied_at ??= null; r.last_chased_at ??= null; });
  db.onRpc("ingest_lead", (args, d) => {
    const p = args.p as Row;
    const phone = (p.phone_e164 as string | null) ?? null;
    let contact = phone ? d.rows("contacts").find((c) => c.phone_e164 === phone) : undefined;
    if (!contact) {
      contact = { id: randomUUID(), full_name: p.full_name, phone_e164: phone, email: p.email ?? null, city: p.city ?? null, consent_calls: true, role: "other" };
      d.rows("contacts").push(contact);
    }
    let lead = d.rows("leads").find((l) => l.contact_id === contact!.id && !["won", "lost", "no_response"].includes(String(l.status)));
    const isNew = !lead;
    if (!lead) {
      lead = { id: randomUUID(), contact_id: contact.id, source: p.source, status: "new", city: p.city ?? null, date_wanted: p.date_wanted ?? null, guest_count: p.guest_count ?? null, message: p.message ?? null, assigned_to: null, touch_count: 1, first_touch_at: now.toISOString(), last_touch_at: now.toISOString() };
      d.rows("leads").push(lead);
    }
    d.rows("lead_touches").push({ id: randomUUID(), lead_id: lead.id, channel: p.source, direction: "inbound", message: p.message ?? null, payload: p, received_at: now.toISOString() });
    return [{ lead_id: lead.id, contact_id: contact.id, is_new_lead: isNew, is_new_contact: isNew }];
  });
  const channels = createIntegrations({ NEXT_PUBLIC_APP_URL: "https://wiwaha.test" });
  const deps: AgentDeps = { store, llm: opts.llm ?? new NoLlm(), now: () => now, db, channels };
  return { store, db, deps, channels, now };
}

/**
 * Ananya & Rohan's wedding, just booked: payment schedule, two functions,
 * family contacts and the planning stages. `paid` marks milestones paid.
 */
export function seedWedding(w: ReturnType<typeof testWorld>, opts: { paid?: ("deposit" | "contract" | "final")[]; functions?: boolean } = {}) {
  const paid = new Set(opts.paid ?? []);
  const db = w.db;
  db.rows("contacts").push(
    { id: "c-ananya", full_name: "Ananya Iyer", phone_e164: "+919900000101", email: "ananya@example.com", role: "bride" },
    { id: "c-rohan", full_name: "Rohan Kulkarni", phone_e164: "+919900000102", email: "rohan@example.com", role: "groom" },
    { id: "c-mother", full_name: "Lalitha Iyer", phone_e164: "+919900000103", email: null, role: "parent" },
  );
  db.rows("weddings").push({ id: "wd1", code: "WIW-2027-001", title: "Ananya & Rohan", primary_contact_id: "c-ananya", event_start: "2027-02-12", event_end: "2027-02-13", guest_count: 350, complimentary_rooms: 10, contract_value_paise: 2_000_000_00, stage: "booking", status: "active", event_manager_id: STAFF.em.id });
  db.rows("wedding_contacts").push(
    { wedding_id: "wd1", contact_id: "c-ananya", relation: "bride", is_key_contact: true },
    { wedding_id: "wd1", contact_id: "c-rohan", relation: "groom", is_key_contact: true },
    { wedding_id: "wd1", contact_id: "c-mother", relation: "mother of the bride", is_key_contact: false },
  );
  const pay = (id: string, milestone: string, label: string, amount: number, due: string, sort: number) =>
    ({ id, wedding_id: "wd1", milestone, label, amount_paise: amount, due_on: due, status: paid.has(milestone as "deposit") ? "paid" : "scheduled", paid_amount_paise: paid.has(milestone as "deposit") ? amount : null, receipt_number: paid.has(milestone as "deposit") ? `RCPT-${sort}` : null, link_url: null, link_id: null, reminders_sent: [], sort });
  db.rows("payments").push(
    pay("pay-dep", "deposit", "Deposit (10%)", 200_000_00, "2026-10-03", 1),
    pay("pay-con", "contract", "Contract payment (40%)", 800_000_00, "2026-10-17", 2),
    pay("pay-fin", "final", "Final payment (50%)", 1_000_000_00, "2027-01-13", 3),
  );
  const stage = (key: string, name: string, sort: number, status: string, rec: string) => ({ id: `st-${key}`, wedding_id: "wd1", key, name, sort, status, recommended_start: rec, started_at: null, nudged_at: null, escalated_at: null, snoozed_until: null });
  db.rows("wedding_stages").push(
    stage("brief", "Your wedding brief", 10, "not_started", "2026-11-14"),
    stage("menus", "Menus & tasting", 30, "not_started", "2026-11-14"),
    stage("decor", "Décor & moodboards", 40, paid.has("contract") ? "not_started" : "locked", "2026-11-14"),
    stage("vendors", "Vendors", 60, "not_started", "2026-11-14"),
  );
  if (opts.functions !== false) {
    db.rows("event_functions").push(
      { id: "fn-haldi", wedding_id: "wd1", type: "haldi", name: "Haldi", date: "2027-02-12", start_time: "09:00:00", end_time: "12:00:00", guest_count: 120, rituals: null, space_id: null },
      { id: "fn-wed", wedding_id: "wd1", type: "wedding", name: "Wedding", date: "2027-02-13", start_time: "07:30:00", end_time: "13:00:00", guest_count: 350, rituals: "Agni and saptapadi", space_id: null },
    );
  }
  db.rows("price_book_items").push(
    { id: "pb-ven", code: "VEN-DAY", category: "venue", name: "Estate day", unit: "day", unit_price_paise: 450_000_00, gst_rate_bps: 1800, active: true },
    { id: "pb-veg", code: "CAT-VEG-STD", category: "catering", name: "Veg plate", unit: "plate", unit_price_paise: 1_200_00, gst_rate_bps: 500, active: true },
    { id: "pb-nv", code: "CAT-NV-STD", category: "catering", name: "Non-veg plate", unit: "plate", unit_price_paise: 1_500_00, gst_rate_bps: 500, active: true },
    { id: "pb-mandap", code: "DEC-MANDAP-S", category: "decor", name: "Standard mandap", unit: "set", unit_price_paise: 350_000_00, gst_rate_bps: 1800, active: true },
    { id: "pb-haldi", code: "DEC-HALDI-S", category: "decor", name: "Standard haldi", unit: "set", unit_price_paise: 90_000_00, gst_rate_bps: 1800, active: true },
    { id: "pb-av", code: "AV-SOUND", category: "av", name: "Sound and light", unit: "function", unit_price_paise: 60_000_00, gst_rate_bps: 1800, active: true },
    { id: "pb-valet", code: "SVC-VALET", category: "services", name: "Valet", unit: "day", unit_price_paise: 25_000_00, gst_rate_bps: 1800, active: true },
  );
  return { weddingId: "wd1" };
}

/** Mirror the store's approvals into the db so agents can read them back, then decide one. */
export function decide(w: ReturnType<typeof testWorld>, approvalId: string, status: "approved" | "rejected" = "approved", edited?: Row) {
  const a = w.store.approvals.find((x) => x.id === approvalId);
  if (!a) throw new Error(`No approval ${approvalId}`);
  w.db.rows("approvals").push({ id: a.id, kind: a.kind, payload: a.payload, edited_payload: edited ?? null, wedding_id: a.weddingId ?? null, lead_id: a.leadId ?? null, status, decided_by: STAFF.owner.id });
}
