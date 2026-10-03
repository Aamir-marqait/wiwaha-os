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
