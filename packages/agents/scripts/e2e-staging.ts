/**
 * One fictional wedding end to end against a real Supabase project (staging):
 * enquiry → booked → contract → 10% → onboarding + T-minus plan → brief →
 * décor blocked before 40% → 40% → menus + moodboards → quote (custom line
 * waits for Prashanth) → vendors locked → rooms → event → invoices, deposit,
 * farewell. Runs the same agent code as the app, with sandboxed channels and
 * the template LLM (no API key needed). Approvals are decided as Prashanth.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm --filter @wiwaha/agents e2e:staging
 */
import { createClient } from "@supabase/supabase-js";
import { createIntegrations } from "@wiwaha/integrations";
import { createDispatcher } from "../src/dispatch";
import { routeTasks } from "../src/agents/chief_of_staff/agent";
import { NoLlm } from "../src/framework/llm";
import { SupabaseDb } from "../src/framework/supabase-db";
import { SupabaseAgentStore } from "../src/framework/supabase-store";
import type { AgentDeps } from "../src/framework/types";
import { startCloseOuts } from "../src/agents/finance/agent";
import { sendOffboardingSteps } from "../src/agents/offboarding/agent";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });
const deps: AgentDeps = { store: new SupabaseAgentStore(sb), llm: new NoLlm(), db: new SupabaseDb(sb), channels: createIntegrations({ NEXT_PUBLIC_APP_URL: process.env.APP_URL ?? "https://wiwaha-os.vercel.app", ALLOW_SANDBOX_LINKS: "true" }) };
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push([name, ok, detail]); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data as T; };
const route = async (rounds = 4) => { for (let i = 0; i < rounds; i++) { const r = await routeTasks(deps, createDispatcher(deps), 50); if (r.status !== "done" || r.result.routed === 0) break; } };
const approveAll = async (weddingId: string, kinds: string[], patch: (a: { id: string; kind: string; payload: Record<string, unknown> }) => Promise<void> = async () => undefined) => {
  const rows = must(await sb.from("approvals").select("id, kind, payload").eq("wedding_id", weddingId).eq("status", "pending").in("kind", kinds), "approvals") as { id: string; kind: string; payload: Record<string, unknown> }[];
  for (const a of rows) { await patch(a); must(await sb.from("approvals").update({ status: "approved", decided_at: new Date().toISOString(), decision_note: "e2e: approved as Prashanth" }).eq("id", a.id), "approve"); }
  return rows.length;
};
const pay = async (weddingId: string, milestone: string) => must(await sb.from("payments").update({ status: "paid", gateway: "sandbox", gateway_ref: `sbx_e2e_${milestone}` }).eq("wedding_id", weddingId).eq("milestone", milestone), "pay");
const stage = async (weddingId: string, key: string) => {
  const s = must(await sb.from("wedding_stages").select("id").eq("wedding_id", weddingId).eq("key", key).single(), "stage") as { id: string };
  return sb.rpc("start_stage", { p_stage_id: s.id });
};

async function main() {
  const stamp = Date.now().toString().slice(-6);
  const phone = `+9199${stamp}0000`.slice(0, 13);
  // 1. Enquiry → booked
  const ing = must(await sb.rpc("ingest_lead", { p: { source: "wedmegood", full_name: `E2E Meera Rao ${stamp}`, phone_e164: phone, email: `meera.${stamp}@example.com`, date_wanted: "2027-03-20", guest_count: 220, city: "Bengaluru", message: "Two-day wedding, haldi and wedding." } }), "ingest") as { lead_id: string }[];
  const leadId = ing[0]!.lead_id;
  const em = must(await sb.from("profiles").select("id").eq("role", "event_manager").eq("active", true).limit(1).single(), "em") as { id: string };
  const w = must(await sb.rpc("mark_lead_booked", { p_lead_id: leadId, p_event_start: "2027-03-20", p_event_end: "2027-03-21", p_contract_total_paise: 18_00_000_00, p_event_manager_id: em.id, p_title: `E2E: Meera & Kabir ${stamp}` }), "book") as { id: string; code: string };
  const wid = w.id;
  check("Mark as booked creates the wedding, schedule and stages", !!wid, w.code);
  await route();
  const contract = must(await sb.from("contracts").select("id, status").eq("wedding_id", wid).single(), "contract") as { id: string; status: string };
  check("Contract drafted and waiting for Prashanth", contract.status === "pending_approval");
  const early = await sb.from("contracts").update({ status: "sent" }).eq("id", contract.id);
  check("Contract can't be sent before approval (DB guard)", !!early.error);
  await approveAll(wid, ["contract"]); await route();
  const sent = must(await sb.from("contracts").select("status, esign_url").eq("id", contract.id).single(), "c2") as { status: string; esign_url: string };
  check("Approved contract sent for e-signature with the deposit link", sent.status === "sent" && /sign\/sandbox/.test(sent.esign_url));

  // 2. Deposit → onboarding + plan
  await pay(wid, "deposit"); await route(6);
  const members = must(await sb.from("wedding_members").select("id").eq("wedding_id", wid), "m") as unknown[];
  const plan = must(await sb.from("tasks").select("id, owner_id, due_at").eq("wedding_id", wid).not("template_id", "is", null), "plan") as { owner_id: string | null; due_at: string }[];
  check("10% received: receipt, welcome and portal membership", members.length >= 1);
  check("Planning started: full T-minus plan with owners and dates", plan.length >= 10 && plan.every((t) => t.due_at), `${plan.length} steps, ${plan.filter((t) => t.owner_id).length} with named owners`);

  // 3. Brief
  must(await stage(wid, "brief"), "start brief");
  must(await sb.from("event_functions").insert([
    { wedding_id: wid, type: "haldi", name: "Haldi", date: "2027-03-20", start_time: "09:00", guest_count: 120 },
    { wedding_id: wid, type: "wedding", name: "Wedding", date: "2027-03-21", start_time: "07:30", guest_count: 220, rituals: "Sacred fire" },
  ]), "functions");
  must(await sb.rpc("submit_brief", { p_wedding: wid, p_answers: { cuisines: "South Indian", veg_only: true } }), "submit brief");
  await route(); await approveAll(wid, ["brief"]); await route();

  // 4. Décor blocked before 40%
  const decorEarly = await stage(wid, "decor");
  const mbEarly = await sb.from("moodboards").insert({ wedding_id: wid, function_id: (must(await sb.from("event_functions").select("id").eq("wedding_id", wid).limit(1).single(), "fn") as { id: string }).id, round: 1, theme: "x", design_kind: "standard", status: "generated" });
  check("Décor before the 40% payment is refused (start and direct insert)", !!decorEarly.error && !!mbEarly.error);

  // 5. 40% → menus + décor
  await pay(wid, "contract");
  const signed = must(await sb.from("contracts").select("status").eq("id", contract.id).single(), "c3") as { status: string };
  check("40% paid marks the contract signed", signed.status === "signed");
  must(await stage(wid, "menus"), "menus"); must(await stage(wid, "decor"), "decor"); await route(6);
  const boards = must(await sb.from("moodboards").select("id, function_id, design_kind").eq("wedding_id", wid).eq("round", 1), "mb") as { id: string; function_id: string; design_kind: string }[];
  check("About five moodboards per function, standard and custom labelled", boards.length === 10 && new Set(boards.map((b) => b.design_kind)).size === 2, `${boards.length} boards`);
  const menus = must(await sb.from("menus").select("id").eq("wedding_id", wid), "menus") as { id: string }[];
  check("A menu proposed for each function", menus.length === 2);
  for (const m of menus) must(await sb.rpc("client_approve_menu", { p_menu_id: m.id, p_note: null }), "approve menu");
  // Couple shortlists one board per function (a custom one for the wedding); the décor lead finalises.
  const fns = [...new Set(boards.map((b) => b.function_id))];
  for (const [i, f] of fns.entries()) {
    const pick = boards.find((b) => b.function_id === f && b.design_kind === (i === 1 ? "custom" : "standard"))!;
    must(await sb.rpc("client_shortlist_moodboard", { p_id: pick.id, p_shortlist: true, p_feedback: "Love this" }), "shortlist");
    must(await sb.rpc("finalise_moodboard", { p_id: pick.id }), "finalise");
  }
  await route(6);
  await approveAll(wid, ["custom_decor"]); await route(6);
  const quote = must(await sb.from("quotes").select("id, status").eq("wedding_id", wid).order("version", { ascending: false }).limit(1).single(), "quote") as { id: string; status: string };
  const offBook = must(await sb.from("quote_lines").select("id, quantity").eq("quote_id", quote.id).eq("off_book", true), "ob") as { id: string; quantity: number }[];
  const tooEarly = await sb.from("quotes").update({ status: "sent" }).eq("id", quote.id);
  check("A quote with a custom line waits for Prashanth before the couple sees it", quote.status === "pending_approval" && offBook.length === 1 && !!tooEarly.error);
  for (const l of offBook) must(await sb.from("quote_lines").update({ unit_price_paise: 4_50_000_00, line_total_paise: 4_50_000_00 * l.quantity, off_book: false }).eq("id", l.id), "price");
  await approveAll(wid, ["quote"]); await route();
  must(await sb.rpc("client_approve_quote", { p_quote_id: quote.id }), "client approve quote"); await route();
  const vb = must(await sb.from("vendor_bookings").select("id, reply_token").eq("wedding_id", wid), "vb") as { id: string; reply_token: string }[];
  check("Vendor lock-in requests created with reply links", vb.length >= 2 && vb.every((b) => b.reply_token), `${vb.length} vendors`);
  for (const b of vb) { must(await sb.from("vendor_bookings").update({ status: "confirmed", replied_at: new Date().toISOString() }).eq("id", b.id), "vr"); must(await sb.from("agent_tasks").insert({ kind: "vendor_replied", wedding_id: wid, payload: { booking_id: b.id } }), "t"); }
  await route();
  const vstage = must(await sb.from("wedding_stages").select("status").eq("wedding_id", wid).eq("key", "vendors").single(), "vs") as { status: string };
  check("All vendors confirmed: Vendors stage done", vstage.status === "done");

  // 6. Rooms
  must(await stage(wid, "guests_rooms"), "rooms stage");
  must(await sb.from("room_allocations").insert([1, 2, 3].map((i) => ({ wedding_id: wid, guest_name: `E2E guest family ${i}`, party_size: 2, check_in: "2027-03-19", check_out: "2027-03-22", needs_pickup: i === 1, pickup_at: i === 1 ? "2027-03-19T06:00:00Z" : null, pickup_from: i === 1 ? "BLR T2" : null }))), "guests");
  must(await sb.rpc("submit_rooming_list", { p_wedding: wid }), "rooming"); await route();
  const placed = must(await sb.from("room_allocations").select("room_id").eq("wedding_id", wid).not("room_id", "is", null), "placed") as { room_id: string }[];
  check("Rooms allocated from the rooming list without double-booking", placed.length === 3 && new Set(placed.map((p) => p.room_id)).size === 3);

  // 7. Final payment, the event happens (dates moved into the past for the demo), close-out
  await pay(wid, "final");
  must(await sb.from("calendar_entries").delete().eq("wedding_id", wid), "free calendar");
  must(await sb.from("weddings").update({ event_start: "2026-09-26", event_end: "2026-09-27" }).eq("id", wid), "past");
  await startCloseOuts(deps); await route(6);
  const inv = must(await sb.from("invoices").select("kind, status, total_paise").eq("wedding_id", wid), "inv") as { kind: string; status: string }[];
  check("After the event: final and GST invoices generated, waiting for approval", inv.length === 2 && inv.every((i) => i.status === "pending_approval"));
  const profit = must(await sb.from("wedding_profit").select("profit_paise").eq("wedding_id", wid).single(), "profit") as { profit_paise: number };
  check("Profit report available", typeof profit.profit_paise === "number" || typeof profit.profit_paise === "string");
  await approveAll(wid, ["invoice"]); await route();
  must(await sb.from("inspections").insert({ wedding_id: wid, items: [{ area: "Pavilion", ok: true }], damage_total_paise: 0 }), "inspection");
  must(await sb.from("agent_tasks").insert({ kind: "inspection_done", wedding_id: wid, payload: {} }), "insp"); await route();
  const steps = must(await sb.from("offboarding_steps").select("key, due_on, status").eq("wedding_id", wid).order("due_on"), "steps") as { key: string; due_on: string; status: string }[];
  await sendOffboardingSteps(deps);
  const after = must(await sb.from("offboarding_steps").select("key, status").eq("wedding_id", wid), "steps2") as { key: string; status: string }[];
  check("Farewell sequence scheduled on the right days and drafted in order", steps.length === 6 && steps[0]!.due_on === "2026-09-30" && after.filter((s) => s.status === "drafted").length >= 3, after.map((s) => `${s.key}:${s.status}`).join(", "));

  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed for ${w.code}`);
  if (failed.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
