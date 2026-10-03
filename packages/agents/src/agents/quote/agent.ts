import type { Json } from "@wiwaha/db";
import { addDays, rupees } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { where, type Db } from "../../framework/db";
import { agentDb, deliver, istDate, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { QUOTE_GATE } from "./gate";
import { QUOTE_TOOLS } from "./tools";

export const QUOTE = "quote";
const POLICIES: readonly PolicyKey[] = ["quotes.rules", "discounts", "decor.providers"];

interface PriceItem { id: string; code: string; category: string; name: string; unit: string; unit_price_paise: number; gst_rate_bps: number; design_kind: string | null }
export interface QuoteLine { price_book_item_id: string | null; function_id: string | null; description: string; quantity: number; unit_price_paise: number; gst_rate_bps: number; line_total_paise: number; off_book: boolean; sort: number }

const DECOR_CODE: Record<string, string> = { wedding: "DEC-MANDAP-S", haldi: "DEC-HALDI-S", mehendi: "DEC-HALDI-S", sangeet: "DEC-SANGEET-S", reception: "DEC-SANGEET-S" };

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
    lines.push({ price_book_item_id: item?.id ?? null, function_id: fnId, description, quantity, unit_price_paise: price, gst_rate_bps: item?.gst_rate_bps ?? 1800, line_total_paise: Math.round(price * quantity), off_book: offBook || !item, sort: (lines.length + 1) * 10 });
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
    await db.insert("quote_lines", lines.map((l) => ({ ...l, quote_id: q!.id })));
    const approvalId = await requestApproval(ctx, {
      kind: QUOTE_GATE.approval, weddingId, priority: offBook ? 1 : 2,
      title: `Quote v${version} for ${w?.title ?? "a wedding"}: ${rupees(t.total)}`,
      summary: offBook ? `${offBook} off-book or custom line(s) need your price and approval` : "All lines from the price book",
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
