import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatDateIST, rupees, todayIST } from "@wiwaha/db";
import { isPolicyKey, policySchemas } from "@wiwaha/policy";
import { z } from "zod";
import { DECOR_CATEGORIES, CONDITIONS } from "../decor";
import { ingestLead, leadInputSchema, toIngestPayload } from "../leads";
import { EFFECTS, shortPaymentError, totalPercent } from "../payment-parts";
import type { McpUser } from "./oauth";

export interface ToolContext {
  db: SupabaseClient;
  user: McpUser;
  /** Agents pick up queued work (routing) after the response, as in the app. */
  afterWrite: () => void;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 1) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const r = (paise: unknown) => (paise == null ? null : rupees(Number(paise)));
const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const uuid = z.string().uuid();

/** Runs a tool body; database and validation errors come back as a readable message, not a crash. */
function guard<A>(fn: (args: A) => Promise<ReturnType<typeof ok>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const { db, user } = ctx;
  const changed = <T,>(x: T) => { ctx.afterWrite(); return x; };

  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------
  server.registerTool("whoami", { title: "Who am I", description: "The Wiwaha OS person Claude is acting as, and their role.", annotations: READ }, guard(async () =>
    ok({ name: user.name, email: user.email, role: user.role, note: "Every action runs with this person's permissions and is logged in the audit trail (surface: mcp)." })));

  server.registerTool("today_overview", {
    title: "Today at Wiwaha",
    description: "What needs attention today: approvals waiting, site visits today, tasks due or overdue, payments due in the next 14 days, messages waiting to be sent, and upcoming weddings.",
    annotations: READ,
  }, guard(async () => {
    const today = todayIST();
    const [approvals, visits, tasks, payments, toSend, weddings] = await Promise.all([
      db.from("approvals").select("id, kind, title, priority, created_at").eq("status", "pending").order("priority").order("created_at").limit(15),
      db.from("visits").select("id, scheduled_at, status, lead:leads(id, contact:contacts(full_name))").gte("scheduled_at", `${today}T00:00:00+05:30`).lt("scheduled_at", `${addDays(today, 1)}T00:00:00+05:30`).order("scheduled_at"),
      db.from("tasks").select("id, title, due_at, priority, status, wedding_id").neq("status", "done").lte("due_at", `${addDays(today, 1)}T00:00:00+05:30`).order("due_at").limit(25),
      db.from("payments").select("id, label, amount_paise, due_on, status, wedding:weddings(id, title)").neq("status", "paid").lte("due_on", addDays(today, 14)).order("due_on").limit(25),
      db.from("messages").select("id", { count: "exact", head: true }).eq("status", "approved").eq("direction", "outbound").in("channel", ["whatsapp", "email"]),
      db.from("weddings").select("id, title, event_start, stage").gte("event_end", today).neq("status", "cancelled").order("event_start").limit(10),
    ]);
    return ok({
      date: today,
      approvals_waiting: (approvals.data ?? []).map((a) => ({ id: a.id, kind: a.kind, title: a.title, priority: a.priority })),
      visits_today: (visits.data ?? []).map((v) => ({ id: v.id, at: ist(v.scheduled_at as string), status: v.status, family: one(one(v.lead as unknown as { contact: { full_name: string } } | null)?.contact)?.full_name ?? null })),
      tasks_due: (tasks.data ?? []).map((t) => ({ id: t.id, title: t.title, due: t.due_at ? ist(t.due_at as string) : null, overdue: !!t.due_at && Date.parse(t.due_at as string) < Date.now(), priority: t.priority, wedding_id: t.wedding_id })),
      payments_due_14_days: (payments.data ?? []).map((p) => ({ id: p.id, wedding: one(p.wedding as unknown as { title: string } | null)?.title ?? null, label: p.label, amount: r(p.amount_paise), due_on: p.due_on, status: p.status })),
      messages_to_send: toSend.count ?? 0,
      upcoming_weddings: (weddings.data ?? []).map((w) => ({ id: w.id, title: w.title, starts: w.event_start, stage: w.stage })),
    });
  }));

  // ---------------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------------
  server.registerTool("list_approvals", {
    title: "List approvals",
    description: "Approvals in the queue (messages, contracts, costing/quotes, custom décor, discounts, invoices…). Defaults to those waiting for a decision.",
    inputSchema: { status: z.enum(["pending", "approved", "edited", "rejected", "all"]).default("pending"), limit: z.number().int().min(1).max(100).default(30) },
    annotations: READ,
  }, guard(async ({ status, limit }) => {
    let q = db.from("approvals").select("id, kind, title, summary, status, priority, wedding_id, lead_id, created_at, decided_at").order("created_at", { ascending: false }).limit(limit);
    if (status !== "all") q = q.eq("status", status);
    return ok(must(await q));
  }));

  server.registerTool("get_approval", {
    title: "Get an approval",
    description: "One approval in full, including the draft message or document it would send.",
    inputSchema: { approval_id: uuid },
    annotations: READ,
  }, guard(async ({ approval_id }) => ok(must(await db.from("approvals").select("*").eq("id", approval_id).maybeSingle()) ?? "Not found.")));

  server.registerTool("decide_approval", {
    title: "Approve, edit or reject",
    description: "Decide an approval. 'approve' sends it as drafted; 'edit' sends edited_message instead (for messages); 'reject' sends it back. Approving a costing/quote sends it to the couple for consent.",
    inputSchema: { approval_id: uuid, decision: z.enum(["approve", "edit", "reject"]), edited_message: z.string().max(8000).optional(), note: z.string().max(1000).optional() },
    annotations: { ...WRITE, destructiveHint: true },
  }, guard(async ({ approval_id, decision, edited_message, note }) => {
    let edited: Json = null;
    if (decision === "edit") {
      if (!edited_message?.trim()) return fail("edited_message is required to edit.");
      const a = must(await db.from("approvals").select("payload").eq("id", approval_id).maybeSingle()) as { payload: Record<string, Json> } | null;
      if (!a) return fail("Approval not found.");
      edited = { ...a.payload, body: edited_message.trim() };
    }
    const status = decision === "approve" ? "approved" : decision === "edit" ? "edited" : "rejected";
    must(await db.rpc("decide_approval", { p_approval_id: approval_id, p_decision: status, p_edited_payload: edited, p_note: note?.trim() || "Decided in Claude" }));
    return ok(changed(`Done: ${status}. Agents will act on it now; approved messages go out (or wait in To send while that channel isn't live).`));
  }));

  // ---------------------------------------------------------------------------
  // Leads
  // ---------------------------------------------------------------------------
  server.registerTool("list_leads", {
    title: "List leads",
    description: "Enquiries, newest first. Filter by status or search a name, phone or email.",
    inputSchema: {
      status: z.enum(["new", "contacted", "visit_booked", "visited", "follow_up_done", "negotiating", "won", "lost", "no_response", "open", "all"]).default("open"),
      search: z.string().max(80).optional(), limit: z.number().int().min(1).max(100).default(30),
    },
    annotations: READ,
  }, guard(async ({ status, search, limit }) => {
    let q = db.from("leads").select("id, status, source, date_wanted, guest_count, score, created_at, contact:contacts!inner(full_name, phone_e164, email)").order("created_at", { ascending: false }).limit(limit);
    if (status === "open") q = q.not("status", "in", "(won,lost,no_response)");
    else if (status !== "all") q = q.eq("status", status);
    if (search?.trim()) {
      const s = search.trim().replace(/[%,()]/g, "");
      q = q.or(`full_name.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`, { referencedTable: "contacts" });
    }
    return ok(must(await q));
  }));

  server.registerTool("get_lead", {
    title: "Get a lead",
    description: "One lead with contact, every touch (messages, calls), visits and held dates.",
    inputSchema: { lead_id: uuid },
    annotations: READ,
  }, guard(async ({ lead_id }) => {
    const [lead, touches, visits, holds] = await Promise.all([
      db.from("leads").select("*, contact:contacts(*)").eq("id", lead_id).maybeSingle(),
      db.from("lead_touches").select("channel, direction, message, created_at").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(30),
      db.from("visits").select("id, scheduled_at, status, attendees").eq("lead_id", lead_id).order("scheduled_at"),
      db.from("calendar_entries").select("id, starts_on, ends_on, status, expires_at, space:spaces(name)").eq("lead_id", lead_id).in("status", ["held", "confirmed"]),
    ]);
    if (!lead.data) return fail("Lead not found.");
    return ok({ lead: lead.data, touches: touches.data, visits: visits.data, held_dates: holds.data });
  }));

  server.registerTool("add_lead", {
    title: "Add a lead",
    description: "Record an enquiry (phone call, walk-in, referral…). De-duplicated by phone; the Lead Desk agent then drafts the reply for approval.",
    inputSchema: {
      full_name: z.string().min(2).max(120), phone: z.string().max(30).optional(), email: z.string().max(200).optional(),
      source: z.enum(["manual", "phone", "walk_in", "referral", "whatsapp", "instagram", "website", "wedmegood", "other"]).default("manual"),
      date_wanted: date.optional(), guest_count: z.number().int().min(1).max(5000).optional(), city: z.string().max(80).optional(), message: z.string().max(2000).optional(),
    },
    annotations: WRITE,
  }, guard(async (a) => {
    const parsed = leadInputSchema.safeParse({ ...a, guest_count: a.guest_count ?? "", date_wanted: a.date_wanted ?? "", email: a.email ?? "" });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.");
    const res = await ingestLead(db, toIngestPayload(parsed.data, a.source));
    return ok(changed({ lead_id: res.lead_id, new_lead: res.is_new_lead, note: res.is_new_lead ? "Lead added; the Lead Desk drafts a reply for approval." : "Same phone as an existing lead: added as a new touch on it." }));
  }));

  server.registerTool("update_lead_status", {
    title: "Update a lead's status",
    description: "Move a lead along: contacted, visit_booked, visited, negotiating, lost, no_response… (use book_wedding to mark it won).",
    inputSchema: { lead_id: uuid, status: z.enum(["new", "contacted", "visit_booked", "visited", "follow_up_done", "negotiating", "lost", "no_response"]), reason: z.string().max(200).optional().describe("Required for lost and no_response: why the family didn't book") },
    annotations: WRITE,
  }, guard(async ({ lead_id, status, reason }) => {
    const closing = status === "lost" || status === "no_response";
    if (closing && !reason?.trim()) return ok({ error: "Say why the lead was lost (reason) before closing it." });
    must(await db.from("leads").update({ status, lost_reason: closing ? reason!.trim() : null }).eq("id", lead_id));
    return ok(changed(`Lead is now ${status.replace(/_/g, " ")}.`));
  }));

  server.registerTool("check_availability", {
    title: "Check dates",
    description: "Which spaces and rooms are free, held or booked between two dates.",
    inputSchema: { from: date, to: date },
    annotations: READ,
  }, guard(async ({ from, to }) => {
    const rows = must(await db.rpc("availability", { p_from: from, p_to: to })) as { resource_kind: string; resource_name?: string; day?: string; status?: string }[];
    return ok(rows);
  }));

  server.registerTool("hold_date", {
    title: "Hold a date for a lead",
    description: "Place a soft hold on a space for a lead (expires per the policy book). Give the space by name or id.",
    inputSchema: { lead_id: uuid, space: z.string().min(1).max(80), starts_on: date, ends_on: date.optional(), label: z.string().max(120).optional() },
    annotations: WRITE,
  }, guard(async ({ lead_id, space, starts_on, ends_on, label }) => {
    const spaces = must(await db.from("spaces").select("id, name").eq("active", true)) as { id: string; name: string }[];
    const sp = spaces.find((s) => s.id === space || s.name.toLowerCase() === space.toLowerCase()) ?? spaces.find((s) => s.name.toLowerCase().includes(space.toLowerCase()));
    if (!sp) return fail(`No space called "${space}". Spaces: ${spaces.map((s) => s.name).join(", ")}`);
    must(await db.rpc("place_hold", { p_resource_kind: "space", p_resource_id: sp.id, p_starts_on: starts_on, p_ends_on: ends_on ?? starts_on, p_lead_id: lead_id, p_label: label ?? null }));
    return ok(changed(`Held ${sp.name} from ${starts_on}${ends_on && ends_on !== starts_on ? ` to ${ends_on}` : ""}.`));
  }));

  server.registerTool("book_wedding", {
    title: "Book a wedding",
    description: "Mark a lead as booked: creates the wedding, its payment parts (the standard split), planning stages and the contract draft for Prashanth's approval. Held dates become confirmed.",
    inputSchema: { lead_id: uuid, event_start: date, event_end: date.optional(), contract_total_rupees: z.number().positive(), title: z.string().max(120).optional(), event_manager_email: z.string().max(200).optional(), complimentary_rooms: z.number().int().min(0).max(60).optional() },
    annotations: WRITE,
  }, guard(async (a) => {
    let em: string | null = null;
    if (a.event_manager_email) {
      const p = must(await db.from("profiles").select("id").eq("email", a.event_manager_email.toLowerCase()).maybeSingle()) as { id: string } | null;
      if (!p) return fail("No team member with that email.");
      em = p.id;
    }
    const w = must(await db.rpc("mark_lead_booked", { p_lead_id: a.lead_id, p_event_start: a.event_start, p_event_end: a.event_end ?? a.event_start, p_contract_total_paise: Math.round(a.contract_total_rupees * 100), p_event_manager_id: em, p_title: a.title ?? null })) as { id: string; code: string; title: string };
    if (a.complimentary_rooms !== undefined) must(await db.from("weddings").update({ complimentary_rooms: a.complimentary_rooms }).eq("id", w.id));
    return ok(changed({ wedding_id: w.id, code: w.code, title: w.title, note: "Booked. The contract draft is on its way to Approvals." }));
  }));

  // ---------------------------------------------------------------------------
  // Weddings
  // ---------------------------------------------------------------------------
  server.registerTool("list_weddings", {
    title: "List weddings",
    description: "Weddings by date. Upcoming by default; search by couple name or code.",
    inputSchema: { when: z.enum(["upcoming", "past", "all"]).default("upcoming"), search: z.string().max(80).optional(), limit: z.number().int().min(1).max(100).default(30) },
    annotations: READ,
  }, guard(async ({ when, search, limit }) => {
    const today = todayIST();
    let q = db.from("weddings").select("id, code, title, event_start, event_end, guest_count, stage, status, contract_value_paise").order("event_start", { ascending: when !== "past" }).limit(limit);
    if (when === "upcoming") q = q.gte("event_end", today);
    if (when === "past") q = q.lt("event_end", today);
    if (search?.trim()) { const s = search.trim().replace(/[%,()]/g, ""); q = q.or(`title.ilike.%${s}%,code.ilike.%${s}%`); }
    return ok((must(await q) as Record<string, unknown>[]).map((w) => ({ ...w, contract_value: r(w.contract_value_paise), contract_value_paise: undefined })));
  }));

  server.registerTool("get_wedding", {
    title: "Get a wedding",
    description: "Everything about one wedding: dates, functions, planning stages, payment parts, family and portal logins, entertainment/extras sent and chosen, vendors and work orders, décor assigned, the latest quote, open tasks and ideas.",
    inputSchema: { wedding_id: uuid },
    annotations: READ,
  }, guard(async ({ wedding_id }) => {
    const [w, fns, stages, pays, family, members, picks, vendors, decor, quote, tasks, ideas] = await Promise.all([
      db.from("weddings").select("*, manager:profiles!weddings_event_manager_id_fkey(full_name)").eq("id", wedding_id).maybeSingle(),
      db.from("event_functions").select("id, type, name, date, start_time, end_time, guest_count, space:spaces(name)").eq("wedding_id", wedding_id).order("date"),
      db.from("wedding_stages").select("key, name, status, recommended_start, started_at, unlock_rule").eq("wedding_id", wedding_id).order("sort"),
      db.from("payments").select("id, label, percent_bps, amount_paise, due_on, status, effect, receipt_number").eq("wedding_id", wedding_id).order("sort"),
      db.from("wedding_contacts").select("relation, is_key_contact, contact:contacts(full_name, phone_e164, email)").eq("wedding_id", wedding_id),
      db.from("wedding_members").select("display_name, email, member_role, accepted_at").eq("wedding_id", wedding_id),
      db.from("wedding_selections").select("id, vertical, name, status, client_note").eq("wedding_id", wedding_id),
      db.from("vendor_bookings").select("id, status, work_order_approved_at, amount_paise, vendor:vendors(name, category)").eq("wedding_id", wedding_id),
      db.from("decor_assignments").select("area, quantity, status, item:decor_items(name)").eq("wedding_id", wedding_id).neq("status", "cancelled"),
      db.from("quotes").select("id, version, status, total_paise").eq("wedding_id", wedding_id).order("version", { ascending: false }).limit(1),
      db.from("tasks").select("id, title, due_at, status").eq("wedding_id", wedding_id).neq("status", "done").order("due_at").limit(20),
      db.from("wedding_ideas").select("body, link_url, noted_at, created_at").eq("wedding_id", wedding_id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (!w.data) return fail("Wedding not found.");
    return ok({
      wedding: { ...w.data, contract_value: r(w.data.contract_value_paise) },
      functions: fns.data, stages: stages.data,
      payment_parts: (pays.data ?? []).map((p) => ({ ...p, percent: p.percent_bps != null ? Number(p.percent_bps) / 100 : null, amount: r(p.amount_paise) })),
      family: family.data, portal_logins: members.data, entertainment_and_extras: picks.data,
      vendors: (vendors.data ?? []).map((v) => ({ id: v.id, vendor: one(v.vendor as unknown as { name: string; category: string } | null), status: v.status, work_order: v.work_order_approved_at ? "approved" : "waiting for our approval", our_cost: r(v.amount_paise) })),
      decor_assigned: decor.data, latest_quote: (quote.data ?? [])[0] ? { ...(quote.data ?? [])[0], total: r((quote.data ?? [])[0]!.total_paise) } : null,
      open_tasks: tasks.data, ideas: ideas.data,
    });
  }));

  server.registerTool("get_costing", {
    title: "Get a wedding's costing",
    description: "The latest quote line by line: price agreed with the couple, the prescribed rate, our cost and margin (Prashanth and accounts only).",
    inputSchema: { wedding_id: uuid },
    annotations: READ,
  }, guard(async ({ wedding_id }) => {
    const q = (must(await db.from("quotes").select("id, version, status, subtotal_paise, tax_paise, total_paise, approval_id, lines:quote_lines(id, description, quantity, unit_price_paise, line_total_paise, off_book, sort, costing:quote_line_costs(prescribed_unit_paise, unit_cost_paise))").eq("wedding_id", wedding_id).order("version", { ascending: false }).limit(1)) as Record<string, unknown>[])[0];
    if (!q) return ok("No quote yet: it's prepared once menus, décor, entertainment and extras are final.");
    const lines = (q.lines as { id: string; description: string; quantity: number; unit_price_paise: number; line_total_paise: number; off_book: boolean; sort: number; costing: unknown }[]).sort((a, b) => a.sort - b.sort).map((l) => {
      const c = one(l.costing as { prescribed_unit_paise: number | null; unit_cost_paise: number | null } | null);
      const cost = c?.unit_cost_paise != null ? Math.round(c.unit_cost_paise * Number(l.quantity)) : null;
      return { line_id: l.id, description: l.description, quantity: Number(l.quantity), agreed_each: r(l.unit_price_paise), line_total: r(l.line_total_paise), prescribed_each: r(c?.prescribed_unit_paise), our_cost: r(cost), margin: cost != null && l.line_total_paise ? `${Math.round(((l.line_total_paise - cost) / l.line_total_paise) * 100)}%` : null, needs_price: l.off_book };
    });
    return ok({ quote_id: q.id, version: q.version, status: q.status, approval_id: q.approval_id, subtotal: r(q.subtotal_paise), gst: r(q.tax_paise), total: r(q.total_paise), lines });
  }));

  server.registerTool("set_line_price", {
    title: "Change a costing line's price",
    description: "Set the price per unit (in rupees) on a line of a quote that is waiting for Prashanth's approval. Totals are recomputed when the costing is approved.",
    inputSchema: { line_id: uuid, rupees_each: z.number().min(0) },
    annotations: WRITE,
  }, guard(async ({ line_id, rupees_each }) => {
    const l = must(await db.from("quote_lines").select("quantity").eq("id", line_id).maybeSingle()) as { quantity: number } | null;
    if (!l) return fail("Line not found.");
    const unit = Math.round(rupees_each * 100);
    must(await db.from("quote_lines").update({ unit_price_paise: unit, line_total_paise: Math.round(unit * Number(l.quantity)), off_book: false }).eq("id", line_id));
    return ok(changed(`Price set to ${rupees(unit)} each.`));
  }));

  server.registerTool("set_payment_parts", {
    title: "Change a wedding's payment parts",
    description: "Give one wedding its own split. Parts in order, each with label, percent, due_on (YYYY-MM-DD) and what it unlocks: books (holds the date and signs the contract), holds_date, signs_contract, final or none. Include paid parts unchanged (with their id). Must add up to 100%.",
    inputSchema: {
      wedding_id: uuid,
      parts: z.array(z.object({ id: uuid.optional(), label: z.string().min(1).max(120), percent: z.number().min(0).max(100), due_on: date, effect: z.enum(EFFECTS) })).min(1).max(12),
    },
    annotations: WRITE,
  }, guard(async ({ wedding_id, parts }) => {
    if (totalPercent(parts) !== 100) return fail(`The parts add up to ${totalPercent(parts)}%; they must add up to 100%.`);
    must(await db.rpc("set_payment_parts", { p_wedding: wedding_id, p_parts: parts.map((p) => ({ id: p.id ?? null, label: p.label, percent_bps: Math.round(p.percent * 100), due_on: p.due_on, effect: p.effect })) }));
    return ok(changed("Payment parts saved."));
  }));

  server.registerTool("record_payment", {
    title: "Record a payment received",
    description: "Mark a payment part paid in full (bank transfer, UPI, cheque, cash…). An amount below the part is refused: split the part with set_payment_parts first. The receipt is issued and its unlocks (date held, contract signed, planning) follow automatically.",
    inputSchema: { payment_id: uuid, method: z.enum(["upi", "bank_transfer", "cheque", "cash", "card", "netbanking", "other"]), rupees: z.number().positive().optional(), reference: z.string().max(120).optional() },
    annotations: WRITE,
  }, guard(async ({ payment_id, method, rupees: amount, reference }) => {
    const p = must(await db.from("payments").select("id, amount_paise, status").eq("id", payment_id).maybeSingle()) as { amount_paise: number; status: string } | null;
    if (!p) return fail("Payment not found.");
    if (p.status === "paid") return fail("Already recorded as paid.");
    const paise = Math.round((amount ?? Number(p.amount_paise) / 100) * 100);
    const short = shortPaymentError(paise, Number(p.amount_paise));
    if (short) return fail(short);
    must(await db.from("payments").update({ status: "paid", paid_at: new Date().toISOString(), paid_amount_paise: paise, method, gateway: "manual", gateway_ref: reference?.trim() || null }).eq("id", payment_id));
    return ok(changed(`Recorded ${rupees(paise)} by ${method.replace("_", " ")}. The receipt is drafted for approval.`));
  }));

  server.registerTool("open_stage", {
    title: "Open a planning stage now",
    description: "Open a wedding's planning stage (menus, décor, entertainment, extras…) ahead of its date. Its payment unlock still applies.",
    inputSchema: { wedding_id: uuid, stage_key: z.string().min(2).max(40) },
    annotations: WRITE,
  }, guard(async ({ wedding_id, stage_key }) => {
    const s = must(await db.from("wedding_stages").select("id, name").eq("wedding_id", wedding_id).eq("key", stage_key).maybeSingle()) as { id: string; name: string } | null;
    if (!s) return fail("No such stage for this wedding.");
    must(await db.rpc("start_stage", { p_stage_id: s.id }));
    return ok(changed(`${s.name} is open.`));
  }));

  // ---------------------------------------------------------------------------
  // Entertainment and extras
  // ---------------------------------------------------------------------------
  server.registerTool("list_options", {
    title: "List entertainment or extras",
    description: "The options we offer (with price to client and our cost).",
    inputSchema: { vertical: z.enum(["entertainment", "extras"]) },
    annotations: READ,
  }, guard(async ({ vertical }) => ok((must(await db.from("service_options").select("id, category, name, description, unit, rate_paise, cost_paise, guest_bookable, active").eq("vertical", vertical).order("sort").order("name")) as Record<string, unknown>[]).map((o) => ({ ...o, price: r(o.rate_paise), our_cost: r(o.cost_paise), rate_paise: undefined, cost_paise: undefined })))));

  server.registerTool("send_options", {
    title: "Send options to a couple",
    description: "Put entertainment or extras options in front of a couple to choose from (they can only pick what's sent).",
    inputSchema: { wedding_id: uuid, vertical: z.enum(["entertainment", "extras"]), option_ids: z.array(uuid).min(1).max(40), function_id: uuid.optional(), note: z.string().max(500).optional() },
    annotations: WRITE,
  }, guard(async ({ wedding_id, vertical, option_ids, function_id, note }) => {
    const opts = must(await db.from("service_options").select("id, name, description, image_url").eq("vertical", vertical).eq("active", true).in("id", option_ids)) as { id: string; name: string; description: string | null; image_url: string | null }[];
    if (!opts.length) return fail("None of those options exist.");
    const now = new Date().toISOString();
    must(await db.from("wedding_selections").insert(opts.map((o) => ({ wedding_id, function_id: function_id ?? null, option_id: o.id, vertical, name: o.name, description: o.description, image_url: o.image_url, status: "sent", sent_at: now, sent_by: user.userId, staff_note: note ?? null }))));
    return ok(changed(`Sent ${opts.length} option${opts.length === 1 ? "" : "s"}: ${opts.map((o) => o.name).join(", ")}.`));
  }));

  server.registerTool("finalise_selection", {
    title: "Make a couple's choice final",
    description: "Confirm an entertainment or extras option the couple chose; it then joins the costing.",
    inputSchema: { selection_id: uuid },
    annotations: WRITE,
  }, guard(async ({ selection_id }) => {
    const d = must(await db.from("wedding_selections").update({ status: "final", finalised_at: new Date().toISOString(), finalised_by: user.userId }).eq("id", selection_id).eq("status", "chosen").select("name").maybeSingle()) as { name: string } | null;
    return d ? ok(changed(`${d.name} is final.`)) : fail("Only an option the couple has chosen can be made final.");
  }));

  // ---------------------------------------------------------------------------
  // Vendors and work orders
  // ---------------------------------------------------------------------------
  server.registerTool("list_work_orders", {
    title: "List vendor work orders",
    description: "Vendor work orders: waiting for our approval, sent, confirmed or declined.",
    inputSchema: { status: z.enum(["to_approve", "sent", "confirmed", "declined", "all"]).default("to_approve") },
    annotations: READ,
  }, guard(async ({ status }) => {
    let q = db.from("vendor_bookings").select("id, status, work_order, amount_paise, work_order_approved_at, requested_at, vendor:vendors(name, category, email), wedding:weddings(id, title, event_start)").order("requested_at", { ascending: false }).limit(50);
    if (status === "to_approve") q = q.eq("status", "requested").is("work_order_approved_at", null);
    else if (status === "sent") q = q.eq("status", "requested").not("work_order_approved_at", "is", null);
    else if (status !== "all") q = q.eq("status", status);
    return ok((must(await q) as Record<string, unknown>[]).map((b) => ({ ...b, our_cost: r(b.amount_paise), amount_paise: undefined })));
  }));

  server.registerTool("approve_work_order", {
    title: "Approve a vendor work order",
    description: "Approve a drafted work order so it goes to the vendor (by email, or To send while email isn't live).",
    inputSchema: { booking_id: uuid },
    annotations: WRITE,
  }, guard(async ({ booking_id }) => {
    must(await db.rpc("approve_work_order", { p_booking: booking_id }));
    return ok(changed("Approved. It goes to the vendor now."));
  }));

  server.registerTool("list_vendors", {
    title: "List vendors",
    description: "Vendors we work with, optionally by category.",
    inputSchema: { category: z.string().max(40).optional() },
    annotations: READ,
  }, guard(async ({ category }) => {
    let q = db.from("vendors").select("id, name, category, contact_name, phone_e164, email, rating, preferred, designated_planner, active").order("category").order("name");
    if (category) q = q.eq("category", category);
    return ok(must(await q));
  }));

  // ---------------------------------------------------------------------------
  // Décor
  // ---------------------------------------------------------------------------
  server.registerTool("list_decor", {
    title: "List décor stock",
    description: "Décor we own: name, type, quantity, condition, where it's stored, and how many are promised to upcoming events. Optionally search.",
    inputSchema: { search: z.string().max(80).optional() },
    annotations: READ,
  }, guard(async ({ search }) => {
    const today = todayIST();
    let q = db.from("decor_items").select("id, name, category, quantity, condition, location, active, photos").order("name");
    if (search?.trim()) q = q.ilike("name", `%${search.trim().replace(/[%]/g, "")}%`);
    const [items, out] = await Promise.all([q, db.from("decor_assignments").select("decor_item_id, quantity, wedding:weddings(title, event_end)").in("status", ["planned", "set_up"])]);
    const promised = new Map<string, number>();
    for (const a of out.data ?? []) {
      const w = one(a.wedding as unknown as { event_end: string } | null);
      if (w && w.event_end >= today) promised.set(a.decor_item_id as string, (promised.get(a.decor_item_id as string) ?? 0) + Number(a.quantity));
    }
    return ok((must(items) as Record<string, unknown>[]).map((i) => ({ id: i.id, name: i.name, category: i.category, quantity: i.quantity, promised_to_upcoming_events: promised.get(i.id as string) ?? 0, condition: i.condition, stored_at: i.location, active: i.active, photos: ((i.photos ?? []) as { url: string }[]).length })));
  }));

  server.registerTool("add_decor_item", {
    title: "Add décor to stock",
    description: "Record a piece of décor we own. Photos are best added in the app (Décor → Stock) from a phone.",
    inputSchema: { name: z.string().min(2).max(120), category: z.enum(DECOR_CATEGORIES).default("other"), quantity: z.number().int().min(0), condition: z.enum(CONDITIONS).default("good"), stored_at: z.string().max(120).optional(), notes: z.string().max(1000).optional() },
    annotations: WRITE,
  }, guard(async (a) => {
    const d = must(await db.from("decor_items").insert({ name: a.name.trim(), category: a.category, quantity: a.quantity, condition: a.condition, location: a.stored_at ?? null, notes: a.notes ?? null }).select("id").single()) as { id: string };
    return ok(changed({ decor_item_id: d.id, note: "Added to stock." }));
  }));

  server.registerTool("assign_decor", {
    title: "Assign décor to an event",
    description: "Promise pieces of décor to a wedding and the area they'll dress (e.g. Main door entry, Lobby, Staircase, Mandap). Refused if we don't have enough free on those dates.",
    inputSchema: { decor_item_id: uuid, wedding_id: uuid, area: z.string().min(2).max(80), quantity: z.number().int().min(1), function_id: uuid.optional(), notes: z.string().max(500).optional() },
    annotations: WRITE,
  }, guard(async (a) => {
    must(await db.from("decor_assignments").insert({ decor_item_id: a.decor_item_id, wedding_id: a.wedding_id, area: a.area, quantity: a.quantity, function_id: a.function_id ?? null, notes: a.notes ?? null }));
    return ok(changed(`Assigned ${a.quantity} to ${a.area}.`));
  }));

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------
  server.registerTool("list_tasks", {
    title: "List tasks",
    description: "Open tasks: yours, or everyone's. Optionally for one wedding.",
    inputSchema: { whose: z.enum(["mine", "everyone"]).default("everyone"), wedding_id: uuid.optional(), include_done: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(40) },
    annotations: READ,
  }, guard(async ({ whose, wedding_id, include_done, limit }) => {
    let q = db.from("tasks").select("id, title, description, due_at, status, priority, owner_role, wedding_id, owner:profiles!tasks_owner_id_fkey(full_name)").order("due_at").limit(limit);
    if (!include_done) q = q.neq("status", "done");
    if (whose === "mine") q = q.eq("owner_id", user.userId);
    if (wedding_id) q = q.eq("wedding_id", wedding_id);
    return ok(must(await q));
  }));

  server.registerTool("create_task", {
    title: "Create a task",
    description: "Add a task for a person (by email) or a role, optionally for a wedding.",
    inputSchema: { title: z.string().min(3).max(300), due_date: date, due_time: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"), owner_email: z.string().max(200).optional(), owner_role: z.enum(["owner", "sales", "event_manager", "staff", "accounts"]).optional(), wedding_id: uuid.optional(), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), description: z.string().max(2000).optional() },
    annotations: WRITE,
  }, guard(async (t) => {
    let ownerId: string | null = null;
    let role = t.owner_role ?? null;
    if (t.owner_email) {
      const p = must(await db.from("profiles").select("id, role").eq("email", t.owner_email.toLowerCase()).maybeSingle()) as { id: string; role: string } | null;
      if (!p) return fail("No team member with that email.");
      ownerId = p.id; role = p.role as typeof role;
    }
    if (!ownerId && !role) return fail("Give owner_email or owner_role.");
    const d = must(await db.from("tasks").insert({
      scope: t.wedding_id ? "wedding" : role === "staff" ? "estate" : role === "sales" ? "sales" : "admin", wedding_id: t.wedding_id ?? null,
      title: t.title.trim(), description: t.description?.trim() || null, owner_id: ownerId, owner_role: role, due_at: new Date(`${t.due_date}T${t.due_time}:00+05:30`).toISOString(),
      priority: t.priority, proof_kind: "tick", created_by: user.userId,
    }).select("id").single()) as { id: string };
    return ok(changed({ task_id: d.id, note: "Task created." }));
  }));

  server.registerTool("complete_task", {
    title: "Complete a task",
    description: "Tick a task done (tasks that need a photo or file as proof must be completed in the app).",
    inputSchema: { task_id: uuid, note: z.string().max(500).optional() },
    annotations: WRITE,
  }, guard(async ({ task_id, note }) => {
    must(await db.rpc("complete_task", { p_task_id: task_id, p_note: note ?? "Done (via Claude)" }));
    return ok(changed("Done."));
  }));

  // ---------------------------------------------------------------------------
  // Messages and the policy book
  // ---------------------------------------------------------------------------
  server.registerTool("list_to_send", {
    title: "Messages waiting to be sent",
    description: "Approved WhatsApp and email messages waiting to be sent by hand while those channels aren't live.",
    annotations: READ,
  }, guard(async () => ok(must(await db.from("messages").select("id, channel, to_address, subject, body, created_at, wedding_id, lead_id").eq("status", "approved").eq("direction", "outbound").in("channel", ["whatsapp", "email"]).order("created_at").limit(50)))));

  server.registerTool("get_policies", {
    title: "Read the policy book",
    description: "The rules every agent answers from (payments, holds, décor, planning start, reviews…). Optionally one key or a search word.",
    inputSchema: { key: z.string().max(60).optional(), search: z.string().max(60).optional() },
    annotations: READ,
  }, guard(async ({ key, search }) => {
    let q = db.from("policies").select("key, topic, title, rule_text, value, version").order("sort");
    if (key) q = q.eq("key", key);
    else if (search?.trim()) q = q.or(`title.ilike.%${search.trim()}%,rule_text.ilike.%${search.trim()}%`);
    return ok(must(await q));
  }));

  server.registerTool("update_policy", {
    title: "Change a rule in the policy book",
    description: "Owner only. Replace a rule's text and its settings (JSON, checked against the rule's schema). Agents use the new version from their next run; every version is kept.",
    inputSchema: { key: z.string().min(3).max(60), rule_text: z.string().min(5).max(4000), value_json: z.string().min(2).max(20000), change_note: z.string().max(500) },
    annotations: { ...WRITE, destructiveHint: true },
  }, guard(async ({ key, rule_text, value_json, change_note }) => {
    let value: unknown;
    try { value = JSON.parse(value_json); } catch { return fail("value_json isn't valid JSON."); }
    if (isPolicyKey(key)) {
      const parsed = policySchemas[key].safeParse(value);
      if (!parsed.success) return fail(`Settings don't fit this rule: ${parsed.error.issues.map((i) => `${i.path.join(".") || "value"} ${i.message}`).join("; ")}`);
      value = parsed.data;
    }
    const d = must(await db.rpc("update_policy", { p_key: key, p_rule_text: rule_text, p_value: value, p_note: change_note, p_confirmed: false })) as { version: number };
    return ok(changed(`Saved as version ${d.version}.`));
  }));

  server.registerTool("list_payments", {
    title: "List payments",
    description: "Payment parts across weddings: due, overdue or paid within a window.",
    inputSchema: { status: z.enum(["due", "overdue", "paid", "all"]).default("due"), within_days: z.number().int().min(1).max(365).default(30) },
    annotations: READ,
  }, guard(async ({ status, within_days }) => {
    const today = todayIST();
    let q = db.from("payments").select("id, label, amount_paise, paid_amount_paise, due_on, status, paid_at, receipt_number, wedding:weddings(id, title)").order("due_on").limit(100);
    if (status === "due") q = q.neq("status", "paid").lte("due_on", addDays(today, within_days));
    if (status === "overdue") q = q.neq("status", "paid").lt("due_on", today);
    if (status === "paid") q = q.eq("status", "paid").gte("paid_at", `${addDays(today, -within_days)}T00:00:00+05:30`);
    return ok((must(await q) as Record<string, unknown>[]).map((p) => ({ id: p.id, wedding: one(p.wedding as { id: string; title: string } | null), label: p.label, amount: r(p.amount_paise), paid: r(p.paid_amount_paise), due_on: p.due_on, status: p.status, receipt: p.receipt_number, due_label: p.due_on ? formatDateIST(p.due_on as string) : null })));
  }));
}
