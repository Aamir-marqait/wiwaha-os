import type { Json } from "@wiwaha/db";
import { addDays } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { maybeRequestQuote } from "../../domain/readiness";
import { where } from "../../framework/db";
import { agentDb, istDate, proposeClientMessage } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { MENU_GATE } from "./gate";
import { MENU_TOOLS } from "./tools";

export const MENU = "menu";
const POLICIES: readonly PolicyKey[] = ["menus.rules", "venue.facts"];

/** A starting suggestion per function; the couple's brief always wins. */
const SUGGESTED: Record<string, string> = { haldi: "South Indian", mehendi: "North Indian", sangeet: "Pan-Asian", wedding: "South Indian", reception: "Continental", engagement: "North Indian", cocktail: "Continental", pooja: "South Indian" };

interface Fn { id: string; type: string; name: string; guest_count: number | null }

function cuisinesFrom(answers: Record<string, unknown>, fn: Fn, allowed: string[]): string {
  const byFn = (answers.cuisine_by_function ?? {}) as Record<string, string>;
  const pref = byFn[fn.type] ?? (typeof answers.cuisines === "string" ? answers.cuisines.split(/[,/]/)[0]?.trim() : undefined);
  const pick = [pref, SUGGESTED[fn.type], allowed[0]].find((c) => c && allowed.some((a) => a.toLowerCase() === c.toLowerCase()));
  return allowed.find((a) => a.toLowerCase() === (pick ?? "").toLowerCase()) ?? allowed[0] ?? "South Indian";
}

/** Menus stage started: propose a menu per function from the library, book tastings, set the plate-count lock. */
export async function proposeMenus(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ proposed: number }>> {
  return runAgent(deps, MENU, { action: "propose_menus", weddingId, input: {}, fallbackTitle: "Propose menus for each function" }, async (ctx) => {
    const db = agentDb(ctx, MENU_TOOLS);
    const rules = ctx.book.get("menus.rules");
    const [w] = await db.select<{ id: string; title: string; event_start: string; guest_count: number | null; event_manager_id: string | null; primary_contact_id: string | null }>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const [brief] = await db.select<{ answers: Record<string, unknown> }>("wedding_briefs", { where: { wedding_id: weddingId } });
    const answers = brief?.answers ?? {};
    const vegOnly = answers.veg_only === true;
    const functions = await db.select<Fn>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }] });
    const existing = await db.select<{ function_id: string }>("menus", { where: { wedding_id: weddingId } });
    const library = await db.select<{ id: string; cuisine: string; course: string; name: string; is_veg: boolean; sort: number }>("menu_library", { where: { active: true }, order: [{ column: "sort" }] });
    const prices = await db.select<{ code: string; unit_price_paise: number }>("price_book_items", { where: { category: "catering", active: true } });
    const priceOf = (code: string) => prices.find((p) => p.code === code)?.unit_price_paise ?? null;
    const lockOn = addDays(w.event_start, -rules.plate_count_lock_days_before);
    let proposed = 0;
    for (const fn of functions) {
      if (existing.some((m) => m.function_id === fn.id)) continue;
      if (answers.outside_caterer === true) {
        await db.insert("menus", { wedding_id: weddingId, function_id: fn.id, cuisine: "Outside caterer", outside_caterer: true, outside_caterer_name: typeof answers.outside_caterer_name === "string" ? answers.outside_caterer_name : null, plate_count: fn.guest_count ?? w.guest_count, plate_count_lock_on: lockOn, status: "proposed", notes: rules.outside_caterer_rules });
        proposed++;
        continue;
      }
      const cuisine = cuisinesFrom(answers, fn, rules.cuisines);
      const dishes = library.filter((d) => d.cuisine === cuisine && (!vegOnly || d.is_veg));
      const nonVeg = dishes.some((d) => !d.is_veg);
      const [menu] = await db.insert<{ id: string }>("menus", { wedding_id: weddingId, function_id: fn.id, cuisine, outside_caterer: false, per_plate_paise: priceOf(nonVeg ? "CAT-NV-STD" : "CAT-VEG-STD"), plate_count: fn.guest_count ?? w.guest_count, plate_count_lock_on: lockOn, status: "proposed", tasting_status: "requested" });
      if (dishes.length) await db.insert("menu_items", dishes.map((d, i) => ({ menu_id: menu!.id, course: d.course, name: d.name, is_veg: d.is_veg, sort: (i + 1) * 10 })));
      proposed++;
    }
    if (proposed) {
      const tastingBy = addDays(istDate(ctx.now), rules.tasting_lead_days);
      await db.insert("tasks", { scope: "wedding", wedding_id: weddingId, title: `Book a menu tasting for ${w.title}`, description: `Proposed menus are in the portal. Tasting no earlier than ${tastingBy} (policy: ${rules.tasting_lead_days} days' notice).`, owner_id: w.event_manager_id, owner_role: "event_manager", due_at: new Date(`${tastingBy}T12:00:00+05:30`).toISOString(), priority: "normal", proof_kind: "tick", created_by_agent: MENU });
      await db.update("wedding_stages", { wedding_id: weddingId, key: "menus" }, { status: "awaiting_client", owner_label: "Our chef and the Menu assistant" });
      const [c] = w.primary_contact_id ? await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
      if (c) await proposeClientMessage(ctx, { channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, weddingId, approvalKind: MENU_GATE.messageApproval, title: `Menus ready for ${w.title}`, body: `Namaste ${c.full_name.split(" ")[0]}, your menu options for each function are ready in your portal. Have a look, approve the ones you love, and we'll set up a tasting with our chef.\n\nWarmly,\nTeam Wiwaha` });
    }
    await ctx.log({ action: "propose_menus", status: "ok", weddingId, input: { functions: functions.length }, output: { proposed, lock_on: lockOn } as Json, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { proposed };
  });
}

/** The couple approved a menu: the chef confirms it, and the quote may now be ready. */
export async function onMenuApproved(deps: AgentDeps, menuId: string): Promise<RunOutcome<{ quoteRequested: boolean }>> {
  return runAgent(deps, MENU, { action: "menu_approved", input: { menu_id: menuId }, fallbackTitle: "Confirm an approved menu with the chef" }, async (ctx) => {
    const db = agentDb(ctx, MENU_TOOLS);
    const [m] = await db.select<{ id: string; wedding_id: string; function_id: string; cuisine: string; plate_count: number | null }>("menus", { where: { id: menuId } });
    if (!m) throw new Error("Menu not found");
    const [fn] = await db.select<{ name: string }>("event_functions", { where: { id: m.function_id } });
    await db.insert("tasks", { scope: "wedding", wedding_id: m.wedding_id, function_id: m.function_id, title: `Chef to confirm the ${fn?.name ?? ""} menu`.replace("  ", " "), description: `${m.cuisine}, ${m.plate_count ?? "?"} plates. Mark the menu chef-confirmed once checked.`, owner_role: "event_manager", due_at: new Date(ctx.now.getTime() + 3 * 86_400_000).toISOString(), priority: "normal", proof_kind: "tick", created_by_agent: MENU });
    const remaining = await db.select("menus", { where: { wedding_id: m.wedding_id, status: where.in(["draft", "proposed"]) } });
    if (remaining.length === 0) await db.update("wedding_stages", { wedding_id: m.wedding_id, key: "menus" }, { status: "done", completed_at: ctx.now.toISOString() });
    const quoteRequested = await maybeRequestQuote(db, m.wedding_id, MENU);
    await ctx.log({ action: "menu_approved", status: "ok", weddingId: m.wedding_id, input: { menu_id: menuId }, output: { quote_requested: quoteRequested } });
    return { quoteRequested };
  });
}

/** On the lock date, plate counts freeze (policy "menus.rules"). */
export async function lockPlateCounts(deps: AgentDeps): Promise<RunOutcome<{ locked: number }>> {
  return runAgent(deps, MENU, { action: "lock_plate_counts", input: {}, fallbackTitle: "Lock plate counts" }, async (ctx) => {
    const db = agentDb(ctx, MENU_TOOLS);
    const due = await db.select<{ id: string }>("menus", { where: { plate_count_lock_on: where.lte(istDate(ctx.now)), plate_count_locked_at: where.isNull() } });
    for (const m of due) await db.update("menus", { id: m.id }, { plate_count_locked_at: ctx.now.toISOString() });
    await ctx.log({ action: "lock_plate_counts", status: "ok", input: {}, output: { locked: due.length } });
    return { locked: due.length };
  });
}
