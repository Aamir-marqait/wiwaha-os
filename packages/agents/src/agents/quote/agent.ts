import type { Json } from "@wiwaha/db";
import { addDays, rupees } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { maybeRequestQuote } from "../../domain/readiness";
import { where, type Db } from "../../framework/db";
import { agentDb, deliver, istDate, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { QUOTE_GATE } from "./gate";
import { QUOTE_TOOLS } from "./tools";

export const QUOTE = "quote";
const POLICIES: readonly PolicyKey[] = ["quotes.rules", "discounts", "decor.providers"];

interface PriceItem { id: string; code: string; category: string; name: string; unit: string; unit_price_paise: number; cost_paise?: number | null; gst_rate_bps: number; design_kind: string | null }
/**
 * A quote line is also a costing line: the price agreed with the couple
 * (unit_price_paise), what the price book prescribed when it was made, and our
 * cost, so Prashanth can compare and edit before anything goes to the couple.
 */
export interface QuoteLine { price_book_item_id: string | null; function_id: string | null; description: string; quantity: number; unit_price_paise: number; gst_rate_bps: number; line_total_paise: number; off_book: boolean; sort: number; prescribed_unit_paise: number | null; unit_cost_paise: number | null; selection_id: string | null; category: string | null }

const DECOR_CODE: Record<string, string> = { wedding: "DEC-MANDAP-S", haldi: "DEC-HALDI-S", mehendi: "DEC-HALDI-S", sangeet: "DEC-SANGEET-S", reception: "DEC-SANGEET-S" };

/** "Margin 32% on the lines with a known cost." (blank when no costs are known). */
export function margin(lines: Pick<QuoteLine, "line_total_paise" | "unit_cost_paise" | "quantity">[]): string {
  const known = lines.filter((l) => l.unit_cost_paise != null);
  if (!known.length) return "No costs entered yet.";
  const revenue = known.reduce((a, l) => a + l.line_total_paise, 0);
  const cost = known.reduce((a, l) => a + Math.round((l.unit_cost_paise ?? 0) * l.quantity), 0);
  return `Margin ${revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0}% on the ${known.length} line${known.length === 1 ? "" : "s"} with a known cost.`;
}

/** A selection was made final: the quote may now be ready (the Chief of Staff routes this here). */
export async function onSelectionFinalised(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ requested: boolean }>> {
  return runAgent(deps, QUOTE, { action: "selection_finalised", weddingId, input: {}, fallbackTitle: "Check whether the quote is ready" }, async (ctx) => {
    const db = agentDb(ctx, QUOTE_TOOLS);
    const requested = await maybeRequestQuote(db, weddingId, QUOTE);
    await ctx.log({ action: "selection_finalised", status: "ok", weddingId, input: {}, output: { requested } });
    return { requested };
  });
}

export function totals(lines: Pick<QuoteLine, "line_total_paise" | "gst_rate_bps">[]) {
  const subtotal = lines.reduce((a, l) => a + l.line_total_paise, 0);
  const tax = lines.reduce((a, l) => a + Math.round((l.line_total_paise * l.gst_rate_bps) / 10000), 0);
  return { subtotal, tax, total: subtotal + tax };
}

/** Lines from the price book for the finalised brief, menus and décor. */
export async function buildLines(db: Db, weddingId: string): Promise<{ lines: QuoteLine[]; offBook: number }> {
  const [w] = await db.select<{ event_start: string; event_end: string }>("weddings", { where: { id: weddingId } });
  if (!w) throw new Error("Wedding not found");
  const items = await db.select<PriceItem>("price_book_items", { where: { active: true } });
  const byCode = (c: string) => items.find((i) => i.code === c) ?? null;
  const fns = await db.select<{ id: string; type: string; name: string }>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }] });
  const menus = await db.select<{ function_id: string; cuisine: string; outside_caterer: boolean; per_plate_paise: number | null; plate_count: number | null; status: string }>("menus", { where: { wedding_id: weddingId } });
  const boards = await db.select<{ function_id: string; theme: string; design_kind: string; status: string }>("moodboards", { where: { wedding_id: weddingId, status: where.in(["finalised", "approved"]) } });
  const days = Math.round((Date.parse(w.event_end) - Date.parse(w.event_start)) / 86_400_000) + 1;
  const lines: QuoteLine[] = [];
  const push = (item: PriceItem | null, description: string, quantity: number, unit: number | null, fnId: string | null, offBook = false) => {
    const price = unit ?? item?.unit_price_paise ?? 0;
    lines.push({ price_book_item_id: item?.id ?? null, function_id: fnId, description, quantity, unit_price_paise: price, gst_rate_bps: item?.gst_rate_bps ?? 1800, line_total_paise: Math.round(price * quantity), off_book: offBook || !item, sort: (lines.length + 1) * 10, prescribed_unit_paise: item?.unit_price_paise ?? null, unit_cost_paise: item?.cost_paise ?? null, selection_id: null, category: item?.category ?? null });
  };
  push(byCode("VEN-DAY"), `Estate exclusive use (${days} day${days > 1 ? "s" : ""})`, days, null, null);
  for (const fn of fns) {
    const m = menus.find((x) => x.function_id === fn.id && !x.outside_caterer && ["client_approved", "chef_confirmed"].includes(x.status));
    if (m && m.plate_count) {
      const item = items.find((i) => i.category === "catering" && i.unit_price_paise === m.per_plate_paise) ?? byCode("CAT-VEG-STD");
      push(item, `${fn.name}: ${m.cuisine} menu`, m.plate_count, m.per_plate_paise, fn.id);
    }
    const b = boards.find((x) => x.function_id === fn.id);
    if (b) {
      const std = byCode(DECOR_CODE[fn.type] ?? "DEC-SANGEET-S");
      if (b.design_kind === "custom") push(std, `${fn.name} décor: ${b.theme} (custom; Prashanth to confirm price)`, 1, std?.unit_price_paise ?? 0, fn.id, true);
      else push(std, `${fn.name} décor: ${b.theme}`, 1, null, fn.id);
    }
    push(byCode("AV-SOUND"), `${fn.name}: sound and lighting`, 1, null, fn.id);
  }
  push(byCode("SVC-VALET"), `Valet and parking team (${days} day${days > 1 ? "s" : ""})`, days, null, null);
  // Entertainment and extras the couple chose and the team made final, priced from their list.
  const picks = await db.select<{ id: string; option_id: string | null; function_id: string | null; vertical: string; name: string; quantity: number }>("wedding_selections", { where: { wedding_id: weddingId, status: "final" } });
  const options = picks.length ? await db.select<{ id: string; category: string; rate_paise: number | null; cost_paise: number | null }>("service_options", { where: { id: where.in(picks.map((p) => p.option_id ?? "")) } }) : [];
  for (const p of picks) {
    const o = options.find((x) => x.id === p.option_id);
    const fn = fns.find((f) => f.id === p.function_id);
    const price = o?.rate_paise ?? 0;
    lines.push({
      price_book_item_id: null, function_id: p.function_id, description: `${fn ? `${fn.name}: ` : ""}${p.name}${o?.rate_paise == null ? " (Prashanth to confirm price)" : ""}`,
      quantity: p.quantity, unit_price_paise: price, gst_rate_bps: 1800, line_total_paise: Math.round(price * p.quantity), off_book: o?.rate_paise == null,
      sort: (lines.length + 1) * 10, prescribed_unit_paise: o?.rate_paise ?? null, unit_cost_paise: o?.cost_paise ?? null, selection_id: p.id, category: o ? `${p.vertical}:${o.category}` : p.vertical,
    });
  }
  return { lines, offBook: lines.filter((l) => l.off_book).length };
}

/** Quote requested (menus and décor final): price it and put it in front of Prashanth. */
export async function prepareQuote(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ quoteId: string; approvalId: string; totalPaise: number }>> {
  return runAgent(deps, QUOTE, { action: "prepare_quote", weddingId, input: {}, fallbackTitle: "Prepare a quote" }, async (ctx) => {
    const db = agentDb(ctx, QUOTE_TOOLS);
    const [w] = await db.select<{ title: string }>("weddings", { where: { id: weddingId } });
    const { lines, offBook } = await buildLines(db, weddingId);
    const t = totals(lines);
    const prior = await db.select<{ version: number }>("quotes", { where: { wedding_id: weddingId }, order: [{ column: "version", ascending: false }], limit: 1 });
    const version = (prior[0]?.version ?? 0) + 1;
    const rules = ctx.book.get("quotes.rules");
    const [q] = await db.insert<{ id: string }>("quotes", { wedding_id: weddingId, version, status: "pending_approval", subtotal_paise: t.subtotal, tax_paise: t.tax, total_paise: t.total, valid_until: addDays(istDate(ctx.now), rules.validity_days), created_by_agent: QUOTE });
    // Our cost and the prescribed rate go in a table the couple can't read.
    const inserted = await db.insert<{ id: string }>("quote_lines", lines.map(({ prescribed_unit_paise: _p, unit_cost_paise: _c, ...l }) => ({ ...l, quote_id: q!.id })));
    await db.insert("quote_line_costs", inserted.map((row, i) => ({ id: row.id, prescribed_unit_paise: lines[i]!.prescribed_unit_paise, unit_cost_paise: lines[i]!.unit_cost_paise })));
    const approvalId = await requestApproval(ctx, {
      kind: QUOTE_GATE.approval, weddingId, priority: offBook ? 1 : 2,
      title: `Costing for ${w?.title ?? "a wedding"} (quote v${version}): ${rupees(t.total)}`,
      summary: `${offBook ? `${offBook} off-book or custom line(s) need your price. ` : "All lines from the price book. "}${margin(lines)} Review and edit on the Wedding Room's Payments tab; approving sends it to the couple for their consent.`,
      payload: { quote_id: q!.id, off_book_lines: offBook },
      flags: offBook ? ["off_book"] : [],
    });
    await db.update("quotes", { id: q!.id }, { approval_id: approvalId });
    await ctx.log({ action: "prepare_quote", status: "gated", weddingId, subjectTable: "quotes", subjectId: q!.id, input: {}, output: { version, total_paise: t.total, off_book: offBook, approval_id: approvalId } as Json, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { quoteId: q!.id, approvalId, totalPaise: t.total };
  });
}

/** Prashanth decided: release the quote to the couple (the DB checks off-book approval) or park it. */
export async function onQuoteDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ sent: boolean }>> {
  return runAgent(deps, QUOTE, { action: "quote_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Release an approved quote" }, async (ctx) => {
    const db = agentDb(ctx, QUOTE_TOOLS);
    const [q] = await db.select<{ id: string; wedding_id: string; version: number }>("quotes", { where: { approval_id: approvalId } });
    if (!q) return { sent: false };
    if (status === "rejected") {
      await db.update("quotes", { id: q.id }, { status: "rejected" });
      await ctx.log({ action: "quote_decided", status: "ok", weddingId: q.wedding_id, input: { status }, output: { sent: false } });
      return { sent: false };
    }
    // Recompute from the (possibly re-priced) lines before release.
    const lines = await db.select<{ line_total_paise: number; gst_rate_bps: number }>("quote_lines", { where: { quote_id: q.id } });
    const t = totals(lines);
    await db.update("quotes", { id: q.id }, { subtotal_paise: t.subtotal, tax_paise: t.tax, total_paise: t.total, status: "sent" });
    const [w] = await db.select<{ title: string; primary_contact_id: string | null }>("weddings", { where: { id: q.wedding_id } });
    const [c] = w?.primary_contact_id ? await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
    const to = c?.phone_e164 ?? c?.email ?? null;
    if (to && ctx.deps.channels) {
      const body = `Namaste ${c!.full_name.split(" ")[0]}, your quote is ready in your portal, with every line explained. Take your time; once you approve it, we'll lock in your vendors.\n\nWarmly,\nTeam Wiwaha`;
      const messageId = await deps.store.createMessage({ weddingId: q.wedding_id, channel: c!.phone_e164 ? "whatsapp" : "email", direction: "outbound", status: "approved", authorKind: "agent", agentKey: QUOTE, approvalId, toAddress: to, subject: "Your Wiwaha quote", body });
      await deliver(deps, { kind: c!.phone_e164 ? "whatsapp" : "email", to, subject: "Your Wiwaha quote", body, messageId, weddingId: q.wedding_id, subjectTable: "quotes", subjectId: q.id });
    }
    await ctx.log({ action: "quote_decided", status: "ok", weddingId: q.wedding_id, subjectTable: "quotes", subjectId: q.id, input: { status }, output: { sent: true, total_paise: t.total } });
    return { sent: true };
  });
}
