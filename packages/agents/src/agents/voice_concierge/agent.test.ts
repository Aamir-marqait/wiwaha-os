import { describe, expect, it } from "vitest";
import { testWorld, STAFF } from "../../framework/testing";
import { ToolNotAllowedError, scopeDb } from "../../framework/db";
import { finishCall, openInboundCall, parseSpokenDate, placeFollowUpCalls, voiceStart, voiceTurn } from "./agent";
import { VOICE_TOOLS } from "./tools";

async function call(world: ReturnType<typeof testWorld>, from = "+919845011111") {
  const { callId } = await openInboundCall(world.deps, { from });
  const start = await voiceStart(world.deps, callId);
  if (start.status !== "done") throw new Error(start.status);
  const say = async (text: string) => {
    const out = await voiceTurn(world.deps, callId, text);
    if (out.status !== "done") throw new Error(`${out.status}: ${"error" in out ? out.error : ""}`);
    return out.result;
  };
  return { callId, say, greeting: start.result.say };
}

const PRICE = /₹|\brs\.?\b|\binr\b|\d+\s*(lakh|crore|k\b)/i;

describe("Voice Concierge: the seven scenarios (handoff, Phase 2)", () => {
  it("1. local caller asks the price: declines politely, explains, offers a visit slot", async () => {
    const w = testWorld();
    const c = await call(w);
    expect(c.greeting).toMatch(/recorded/);
    const r1 = await c.say("Hi, what's the price for a wedding?");
    expect(r1.say).toMatch(/where the family is based/);
    const r2 = await c.say("We're in Bengaluru");
    expect(r2.say).toMatch(/depends on your dates, guest count and plans/);
    expect(r2.say).toMatch(/book a visit for/);
    expect(r2.say).not.toMatch(PRICE);
    expect(r2.action).toBe("continue");
  });

  it("2. caller from Hyderabad: only the approved band, brochure + video tour on WhatsApp, video call offered", async () => {
    const w = testWorld();
    w.store.setPolicy("pricing.phone", { ...structuredClone(w.store.policies.find((p) => p.key === "pricing.phone")!.value as object), out_of_town_band: { enabled: true, starting_from_paise: 25_00_000_00, label: "Approved band" } });
    const c = await call(w, "+919845022222");
    await c.say("How much does a wedding cost there?");
    const r = await c.say("I'm calling from Hyderabad");
    expect(r.say).toMatch(/start from ₹25,00,000/);
    expect(r.say).toMatch(/brochure and a video tour on WhatsApp/);
    expect(r.say).toMatch(/video call/);
    // The WhatsApp with the brochure waits for approval while the agent is in draft.
    expect(w.store.approvals.some((a) => a.title.includes("Brochure"))).toBe(true);
  });

  it("2b. out-of-town caller with no approved band: no price, escalated to Prashanth", async () => {
    const w = testWorld();
    const c = await call(w);
    await c.say("What are your rates?");
    const r = await c.say("We live in Mumbai");
    expect(r.say).not.toMatch(PRICE);
    expect(w.store.humanQueue.some((q) => q.assignedRole === "owner" && /starting price/.test(q.title))).toBe(true);
  });

  it("3. asks for a discount: can't promise one, the team will discuss at the visit", async () => {
    const w = testWorld();
    const c = await call(w);
    const r = await c.say("Can you give us a discount?");
    expect(r.say).toMatch(/not able to promise a discount/);
    expect(r.say).toMatch(/discuss everything with you when you visit/);
    expect(r.say).not.toMatch(/\d+\s*%/);
    expect(w.store.humanQueue.some((q) => q.assignedRole === "owner" && /discount/.test(q.title))).toBe(true);
  });

  it("4. date already booked: says so honestly and offers nearby dates", async () => {
    const w = testWorld();
    for (const sp of ["sp-lawn", "sp-pav", "sp-hall"]) {
      w.db.rows("calendar_entries").push({ id: `ce-${sp}`, space_id: sp, starts_on: "2027-02-14", ends_on: "2027-02-14", status: "confirmed", expires_at: null });
    }
    const c = await call(w);
    const r = await c.say("Is 14th February 2027 available for 300 guests?");
    expect(r.say).toMatch(/already booked/);
    expect(r.say).toMatch(/Nearby dates that are open: .*February/);
    expect(r.say).not.toMatch(/currently open\./);
  });

  it("5a. caller asks for a person: transfers immediately", async () => {
    const w = testWorld();
    const c = await call(w);
    const r = await c.say("Can I talk to a real person please?");
    expect(r.action).toBe("transfer");
    expect(r.transferTo).toBe(STAFF.sales.phone_e164);
    expect(r.say).toMatch(/connect you/);
  });

  it("5b. upset caller and nobody to take the call: promises a callback and creates an urgent task", async () => {
    const w = testWorld();
    w.db.update("profiles", { role: "sales" }, { phone_e164: null });
    const c = await call(w);
    const r = await c.say("This is ridiculous, I've been waiting all week!!");
    expect(r.action).toBe("hangup");
    expect(r.say).toMatch(/call you back within 30 minutes/);
    const task = w.db.rows("tasks")[0];
    expect(task).toMatchObject({ priority: "urgent", scope: "sales" });
  });

  it("6. caller speaks Kannada: continues in Kannada", async () => {
    const w = testWorld();
    const c = await call(w);
    const r = await c.say("ನಮಸ್ಕಾರ, ನಿಮ್ಮಲ್ಲಿ ಎಷ್ಟು ಕೊಠಡಿಗಳಿವೆ?");
    expect(r.language).toBe("kn");
    expect(r.speechLocale).toBe("kn-IN");
    expect(r.say).toMatch(/[ಀ-೿]/);
    expect(r.say).toMatch(/30/);
  });

  it("7. asks something not in the policy book: says it will check, creates a task, never guesses", async () => {
    const w = testWorld();
    const c = await call(w);
    const r = await c.say("Do you allow drones for the pheras?");
    expect(r.say).toMatch(/check that with the team/);
    expect(w.store.humanQueue.some((q) => q.reason === "off_policy" && /drones/.test(q.detail ?? ""))).toBe(true);
  });
});

describe("Voice Concierge: booking a visit on the phone", () => {
  it("offers a slot, takes a name, books it, and leaves the Visit Host a task", async () => {
    const w = testWorld();
    const c = await call(w, "+919845033333");
    const r1 = await c.say("We'd like to come and see the venue");
    expect(r1.say).toMatch(/book a visit for .*Shall I go ahead/);
    const r2 = await c.say("Yes please");
    expect(r2.say).toMatch(/your name/i);
    const r3 = await c.say("My name is Kiran Rao");
    expect(r3.say).toMatch(/Your visit is booked for/);
    expect(r3.say).toMatch(/WhatsApp confirmation/);
    const visit = w.db.rows("visits")[0]!;
    expect(visit).toMatchObject({ status: "scheduled", executive_id: STAFF.sales.id, booked_by_agent: "voice_concierge" });
    expect(w.db.rows("agent_tasks").some((t) => t.kind === "visit_booked")).toBe(true);
    expect(w.db.rows("leads")[0]).toMatchObject({ status: "visit_booked", source: "phone" });
    // Visits start no earlier than the policy's lead time and within visiting hours.
    const ist = new Date(Date.parse(String(visit.scheduled_at)) + 330 * 60_000);
    expect(ist.getUTCHours()).toBeGreaterThanOrEqual(10);
    expect(Date.parse(String(visit.scheduled_at)) - w.now.getTime()).toBeGreaterThanOrEqual(4 * 3600_000);
  });

  it("summarises the call onto the lead with its transcript", async () => {
    const w = testWorld();
    const c = await call(w);
    await c.say("How far are you from the airport?");
    const out = await finishCall(w.deps, c.callId, { durationSeconds: 42, recordingUrl: "https://rec/1.mp3" });
    expect(out.status).toBe("done");
    const row = w.db.rows("calls")[0]!;
    expect(row.transcript).toMatch(/Caller: How far are you from the airport\?/);
    expect(row.transcript).toMatch(/15 km/);
    expect(row).toMatchObject({ recording_url: "https://rec/1.mp3", duration_seconds: 42, status: "completed" });
  });
});

describe("Exactly one follow-up call, two days after a visit", () => {
  function withVisit(w: ReturnType<typeof testWorld>) {
    w.db.rows("contacts").push({ id: "c1", full_name: "Deepak Nair", phone_e164: "+919900011105", consent_calls: true });
    w.db.rows("leads").push({ id: "l1", contact_id: "c1", status: "visited" });
    w.db.rows("visits").push({ id: "v1", lead_id: "l1", status: "completed", follow_up_outcome: "pending", follow_up_due_at: new Date(w.now.getTime() - 60_000).toISOString(), follow_up_call_id: null });
  }

  it("fires once, and never again on later runs", async () => {
    const w = testWorld();
    withVisit(w);
    const first = await placeFollowUpCalls(w.deps);
    expect(first.status === "done" && first.result.placed).toBe(1);
    const again = await placeFollowUpCalls(w.deps);
    expect(again.status === "done" && again.result.placed).toBe(0);
    expect(w.db.rows("calls").filter((c) => c.purpose === "follow_up")).toHaveLength(1);
    expect(w.db.rows("outbox")[0]).toMatchObject({ kind: "call", status: "sandboxed" });
  });

  it("no answer: records no response and stops calling", async () => {
    const w = testWorld();
    withVisit(w);
    await placeFollowUpCalls(w.deps);
    const callId = String(w.db.rows("calls")[0]!.id);
    await finishCall(w.deps, callId, { status: "no_answer" });
    expect(w.db.rows("visits")[0]).toMatchObject({ follow_up_outcome: "no_response" });
    expect(w.db.rows("leads")[0]).toMatchObject({ status: "no_response" });
    // Even if the visit were reset by mistake, the unique index blocks a second call.
    w.db.update("visits", { id: "v1" }, { follow_up_outcome: "pending", follow_up_call_id: null });
    const again = await placeFollowUpCalls(w.deps);
    expect(again.status === "done" && again.result.placed).toBe(0);
  });

  it("answered and interested: logs the outcome and tells sales", async () => {
    const w = testWorld();
    withVisit(w);
    await placeFollowUpCalls(w.deps);
    const callId = String(w.db.rows("calls")[0]!.id);
    const start = await voiceStart(w.deps, callId);
    expect(start.status === "done" && start.result.say).toMatch(/Thank you for visiting/);
    await voiceTurn(w.deps, callId, "Yes, we're interested, we'd like to book");
    expect(w.db.rows("visits")[0]).toMatchObject({ follow_up_outcome: "reached_interested" });
    expect(w.db.rows("outbox").some((o) => o.kind === "whatsapp" && o.to_address === STAFF.sales.phone_e164)).toBe(true);
  });
});

describe("Voice Concierge: tools and parsing", () => {
  it("can't touch tables outside its tools.ts", async () => {
    const w = testWorld();
    const scoped = scopeDb(w.db, "voice_concierge", VOICE_TOOLS);
    await expect(scoped.select("payments")).rejects.toBeInstanceOf(ToolNotAllowedError);
    await expect(scoped.update("policies", {}, {})).rejects.toBeInstanceOf(ToolNotAllowedError);
  });
  it.each([
    ["14th March", "2027-03-14"],
    ["March 14 2027", "2027-03-14"],
    ["is 20/12 free", "2026-12-20"],
    ["the 2nd of nothing", null],
  ])("parses %s", (text, iso) => expect(parseSpokenDate(text, "2026-10-03")).toBe(iso));
});
