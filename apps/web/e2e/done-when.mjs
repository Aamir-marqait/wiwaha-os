#!/usr/bin/env node
/**
 * Phase 1 "Done when" checks (handoff §6), run in a real browser against a
 * running app + Supabase seeded with the demo data.
 *
 *   BASE_URL=http://localhost:3000 \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CRON_SECRET=... \
 *   node apps/web/e2e/done-when.mjs [screenshot-dir]
 *
 * The service-role key is only used to fast-forward time (expire a hold) and
 * to read back results; every action under test goes through the UI or API.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2];
const PASSWORD = process.env.DEMO_PASSWORD ?? "WiwahaDemo!2026";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const results = [];
const stamp = Date.now().toString().slice(-6);

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}
async function shot(page, name) {
  if (OUT) await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}
async function phone() {
  return browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
}
async function signIn(ctx, email, surface = "team") {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${surface === "team" ? "login" : "portal/login"}`);
  if (surface === "portal") await page.getByText("Use a password instead").click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname.startsWith(`/${surface}`) && !u.pathname.includes("login"), { timeout: 30_000 });
  return page;
}
async function waitFor(fn, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// 1. A lead entered on the website appears in the inbox, is scored, and gets a drafted reply in the approval queue.
{
  const ctx = await phone();
  const page = await ctx.newPage();
  const name = `Nikhil Shah ${stamp}`;
  await page.goto(`${BASE}/enquire`);
  await page.fill('input[name="full_name"]', name);
  await page.fill('input[name="phone"]', `98${stamp}12`.slice(0, 10));
  await page.fill('input[name="date_wanted"]', "2027-02-20");
  await page.fill('input[name="guest_count"]', "220");
  await page.fill('input[name="city"]', "Mumbai");
  await page.fill('textarea[name="message"]', "We're in Mumbai. Roughly what does a wedding cost at Wiwaha? Do you have rooms?");
  await page.click('button[type="submit"]');
  await page.getByText("Thank you!").waitFor({ timeout: 20_000 });
  await shot(page, "1a-enquiry-sent");

  const lead = await waitFor(async () => {
    const { data } = await db.from("leads").select("id, score, contact:contacts!inner(full_name)").eq("contact.full_name", name).maybeSingle();
    return data?.score != null ? data : null;
  });
  check("Website lead is scored by Lead Desk", !!lead, lead ? `score ${lead.score}` : "no score");
  const approval = lead && (await waitFor(async () => (await db.from("approvals").select("id, payload").eq("lead_id", lead.id).eq("status", "pending").maybeSingle()).data));
  check("Drafted reply waits in the approval queue", !!approval);
  check("Draft quotes no price (no band approved yet)", !!approval && !/₹/.test(approval.payload.body), approval?.payload.body.slice(0, 80));

  const owner = await signIn(await phone(), "prashanth@wiwaha.example");
  await owner.goto(`${BASE}/team/leads`);
  check("Lead appears in the inbox", (await owner.getByText(name).count()) > 0);
  await shot(owner, "1b-inbox-phone");
  await owner.goto(`${BASE}/team/approvals`);
  const card = owner.locator("div", { hasText: `Reply to ${name}` }).filter({ has: owner.getByRole("button", { name: "Approve" }) }).last();
  await shot(owner, "1c-approvals-phone");
  await card.getByRole("button", { name: "Edit" }).click();
  await card.locator("textarea").fill(`${approval?.payload.body ?? ""}\n\n(Prashanth: we'd love to host you.)`);
  await card.getByRole("button", { name: "Save & approve" }).click();
  await owner.getByText(`Edited and approved: Reply to ${name}`).waitFor({ timeout: 15_000 });
  const { data: decided } = await db.from("approvals").select("status, decided_by").eq("id", approval?.id).single();
  check("Prashanth can edit and approve from his phone", decided?.status === "edited" && !!decided.decided_by);
  globalThis.__lead = lead;
  globalThis.__owner = owner;
}

// 2. Holding a date on the calendar blocks it for everyone and releases automatically when it expires.
{
  const owner = globalThis.__owner;
  await owner.goto(`${BASE}/team/calendar`);
  await owner.selectOption('select[name="resource"]', { label: "Sage Hall" });
  await owner.fill('input[name="starts_on"]', "2027-03-06");
  await owner.fill('input[name="label"]', `E2E hold ${stamp}`);
  await owner.getByRole("button", { name: "Place soft hold" }).click();
  await owner.getByText(/Releases automatically/).waitFor({ timeout: 15_000 });
  check("Owner places a soft hold", true);

  const sales = await signIn(await phone(), "kavya@wiwaha.example");
  await sales.goto(`${BASE}/team/calendar`);
  await sales.selectOption('select[name="resource"]', { label: "Sage Hall" });
  await sales.fill('input[name="starts_on"]', "2027-03-06");
  await sales.fill('input[name="label"]', "Second family");
  await sales.getByRole("button", { name: "Place soft hold" }).click();
  const blocked = await sales.getByText("That date is already held or booked").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await shot(sales, "2a-hold-blocked-for-sales");
  check("The hold blocks the date for everyone", blocked);

  // Fast-forward time: make the hold expire, then let the scheduled job run.
  await db.from("calendar_entries").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("label", `E2E hold ${stamp}`);
  const cron = await fetch(`${BASE}/api/cron/agents`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  const { data: entry } = await db.from("calendar_entries").select("status, release_reason").eq("label", `E2E hold ${stamp}`).single();
  check("The hold releases automatically when it expires", entry?.status === "released" && entry.release_reason === "expired", `released ${cron.released}`);
}

// 3. Prashanth changes a policy rule and an agent's next answer reflects it.
{
  const owner = globalThis.__owner;
  await owner.goto(`${BASE}/team/settings/policy/pricing.phone`);
  const raw = await owner.locator('textarea[name="value"]').inputValue();
  const value = JSON.parse(raw);
  value.out_of_town_band = { enabled: true, starting_from_paise: 25_00_000_00, label: "Starting from ₹25 lakh" };
  await owner.locator('textarea[name="value"]').fill(JSON.stringify(value, null, 2));
  await owner.fill('input[name="change_note"]', "Approved band for out-of-town families");
  await owner.getByRole("button", { name: "Save new version" }).click();
  await owner.getByText(/Saved as version \d+/).waitFor({ timeout: 15_000 });
  await shot(owner, "3a-policy-edited");
  check("Owner edits the pricing rule (new version saved)", true);

  await owner.goto(`${BASE}/team/leads/${globalThis.__lead.id}`);
  await owner.getByRole("button", { name: "Re-run Lead Desk" }).click();
  const fresh = await waitFor(async () => (await db.from("approvals").select("payload").eq("lead_id", globalThis.__lead.id).eq("status", "pending").maybeSingle()).data);
  check("Lead Desk's next answer uses the new rule", !!fresh && fresh.payload.body.includes("₹25,00,000"), fresh?.payload.body.match(/[^.]*₹[^.]*\./)?.[0]);
}

// 4. The 8:30 am brief is generated from seed data.
{
  const res = await fetch(`${BASE}/api/cron/morning-brief`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  const owner = globalThis.__owner;
  await owner.goto(`${BASE}/team`);
  const hasBrief = (await owner.getByText(/Morning brief · /).count()) > 0 && (await owner.getByText("Needs your decision").count()) > 0;
  await shot(owner, "4a-brief-phone");
  check("8:30 am brief is generated", res.status === "done" && hasBrief, `headline: ${res.headline}`);
}

// 5. Every agent action and every edit is visible in the logs.
{
  const owner = globalThis.__owner;
  await owner.goto(`${BASE}/team/settings/activity`);
  const agentRows = await owner.getByText(/lead desk|chief of staff/i).count();
  await owner.goto(`${BASE}/team/settings/activity?tab=audit`);
  const auditRows = await owner.locator("tbody tr").count();
  await shot(owner, "5a-audit-log");
  const { data: audit } = await db.from("audit_log").select("ip, user_id").eq("table_name", "policies").eq("record_id", "pricing.phone").order("at", { ascending: false }).limit(1).single();
  check("Agent actions are visible", agentRows > 0, `${agentRows} rows`);
  check("Edits are logged with user and IP", auditRows > 0 && !!audit?.user_id && !!audit.ip, `ip ${audit?.ip}`);
}

// 6. Staging works on a phone (client portal + payment unlocks).
{
  const ctx = await phone();
  const page = await signIn(ctx, "ananya@wiwaha.example", "portal");
  await page.getByText("Your planning journey").waitFor();
  const decorLocked = await page.getByText("Unlocks after the 40% contract payment").count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await shot(page, "6a-portal-phone");
  check("Couple's portal works at 375 px", !overflow && decorLocked > 0, "décor locked until the 40% payment");
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
