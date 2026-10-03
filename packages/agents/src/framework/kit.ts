import type { ApprovalKind, AppRole, Json, MessageChannel } from "@wiwaha/db";
import type { Integrations, OutboundKind } from "@wiwaha/integrations";
import type { PolicyKey } from "@wiwaha/policy";
import { PROMPTS } from "../prompts.generated";
import { scopeDb, where, type Db, type DbGrants, type Row } from "./db";
import { checkClientMessage, type GuardrailContext, type GuardrailFlag } from "./guardrails";
import { decideDelivery, type RunContext } from "./runner";
import type { AgentDeps } from "./types";

/**
 * Shared building blocks for every agent from Phase 2 on, so all 19 of them
 * write, gate, alert and deliver the same way:
 *   - writeText:            model draft (or template), always guard-railed
 *   - proposeClientMessage: anything a client/vendor will read → approval
 *                           queue in `draft`, straight out otherwise
 *   - alertStaff:           internal alerts (in-app + WhatsApp to staff)
 *   - deliver:              the only path to a real channel, via the outbox
 */

export function requireDb(deps: AgentDeps): Db {
  if (!deps.db) throw new Error("This agent needs a database (deps.db)");
  return deps.db;
}

export function agentDb(ctx: RunContext, grants: DbGrants): Db {
  return scopeDb(requireDb(ctx.deps), ctx.agent.key, grants);
}

// ---------------------------------------------------------------------------
// Text: model when available, template otherwise; guardrails always.
// ---------------------------------------------------------------------------
export interface WriteTextInput {
  /** Policy rules the model may use (as a digest; the only way rules reach a model). */
  policies: readonly PolicyKey[];
  /** Facts the model may use, as JSON. Nothing else. */
  facts: Record<string, unknown>;
  task: string;
  template: string;
  /** Client-facing text is checked by the guardrails; failing drafts fall back to the template. */
  clientFacing: boolean;
  guard?: Omit<GuardrailContext, "book">;
  maxTokens?: number;
  language?: string;
}

export interface WrittenText {
  body: string;
  source: "llm" | "template";
  flags: GuardrailFlag[];
  replacedUnsafeDraft: boolean;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdMicros: number | null;
}

export async function writeText(ctx: RunContext, input: WriteTextInput): Promise<WrittenText> {
  const llm = ctx.deps.llm;
  const guard = (text: string) => checkClientMessage(text, { book: ctx.book, ...(input.guard ?? {}) });
  const fromTemplate = (replaced: boolean, flags: GuardrailFlag[] = []): WrittenText => ({
    body: input.template, source: "template", flags, replacedUnsafeDraft: replaced, model: null, inputTokens: null, outputTokens: null, costUsdMicros: null,
  });
  if (!llm.available) return fromTemplate(false);
  const system = `${PROMPTS[ctx.agent.key] ?? ""}\n\n## POLICY BOOK\n${ctx.book.digest(input.policies)}`;
  const prompt = [
    "FACTS (the only facts you may use):",
    JSON.stringify(input.facts, null, 2),
    "",
    input.language && input.language !== "en" ? `Write in this language (ISO code): ${input.language}.` : "",
    input.task,
  ].filter(Boolean).join("\n");
  try {
    const res = await llm.complete({ model: ctx.agent.model, system, prompt, maxTokens: input.maxTokens ?? 1200, effort: "low" });
    const body = res.text.trim();
    if (!body) return fromTemplate(false);
    if (input.clientFacing) {
      const g = guard(body);
      if (!g.ok) return { ...fromTemplate(true, g.flags), model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsdMicros: res.costUsdMicros };
      return { body, source: "llm", flags: g.flags, replacedUnsafeDraft: false, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsdMicros: res.costUsdMicros };
    }
    return { body, source: "llm", flags: [], replacedUnsafeDraft: false, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsdMicros: res.costUsdMicros };
  } catch {
    return fromTemplate(false);
  }
}

// ---------------------------------------------------------------------------
// Client-facing messages: the approval queue in draft mode.
// ---------------------------------------------------------------------------
export interface ProposedMessage {
  channel: MessageChannel;
  to: string | null;
  subject?: string | null;
  body: string;
  leadId?: string | null;
  weddingId?: string | null;
  approvalKind: ApprovalKind;
  title: string;
  summary?: string;
  priority?: 1 | 2 | 3;
  flags?: GuardrailFlag[];
  /** Extra payload stored with the approval (e.g. what to do once approved). */
  payload?: Record<string, Json>;
  metadata?: Record<string, Json>;
  actionId?: string | null;
}

export interface ProposedResult {
  messageId: string;
  approvalId: string | null;
  delivery: "approval" | "notify" | "silent";
}

export async function proposeClientMessage(ctx: RunContext, m: ProposedMessage): Promise<ProposedResult> {
  const flags = m.flags ?? [];
  const delivery = decideDelivery(ctx.agent, flags);
  const store = ctx.deps.store;
  let approvalId: string | null = null;
  if (delivery === "approval") {
    approvalId = await store.createApproval({
      kind: m.approvalKind, title: m.title, summary: m.summary, agentKey: ctx.agent.key, agentActionId: m.actionId ?? null,
      leadId: m.leadId ?? null, weddingId: m.weddingId ?? null, priority: m.priority ?? (flags.length ? 1 : 2), guardrailFlags: flags,
      payload: { body: m.body, subject: m.subject ?? null, channel: m.channel, to: m.to, ...(m.payload ?? {}) },
    });
  }
  const messageId = await store.createMessage({
    leadId: m.leadId ?? null, weddingId: m.weddingId ?? null, channel: m.channel, direction: "outbound",
    status: delivery === "approval" ? "pending_approval" : "approved", authorKind: "agent", agentKey: ctx.agent.key,
    approvalId, toAddress: m.to, subject: m.subject ?? null, body: m.body,
    metadata: { flags, ...(m.metadata ?? {}) },
  });
  if (delivery === "notify") {
    await store.notify({ role: "owner", title: `${ctx.agent.name} sent: ${m.title}`, body: m.body.slice(0, 200), link: m.weddingId ? `/team/weddings/${m.weddingId}` : m.leadId ? `/team/leads/${m.leadId}` : undefined });
  }
  return { messageId, approvalId, delivery };
}

/** Plain approval (contracts, quotes, purchases…): the payload says what happens once approved. */
export async function requestApproval(ctx: RunContext, a: { kind: ApprovalKind; title: string; summary?: string; payload: Record<string, Json>; leadId?: string | null; weddingId?: string | null; priority?: 1 | 2 | 3; flags?: string[]; actionId?: string | null }): Promise<string> {
  return ctx.deps.store.createApproval({
    kind: a.kind, title: a.title, summary: a.summary, agentKey: ctx.agent.key, agentActionId: a.actionId ?? null,
    leadId: a.leadId ?? null, weddingId: a.weddingId ?? null, payload: a.payload, priority: a.priority ?? 2, guardrailFlags: a.flags ?? [],
  });
}

// ---------------------------------------------------------------------------
// Staff alerts: in-app notification + WhatsApp to the person's phone.
// Internal messages need no approval (they never reach a client).
// ---------------------------------------------------------------------------
export async function alertStaff(deps: AgentDeps, a: { role?: AppRole; userIds?: string[]; title: string; body: string; link?: string; whatsapp?: boolean; leadId?: string | null; weddingId?: string | null; agentKey?: string }): Promise<number> {
  const db = requireDb(deps);
  const people = a.userIds?.length
    ? await db.select<{ id: string; phone_e164: string | null; full_name: string }>("profiles", { where: { id: where.in(a.userIds), active: true } })
    : a.role
      ? await db.select<{ id: string; phone_e164: string | null; full_name: string }>("profiles", { where: { role: a.role, active: true } })
      : [];
  if (people.length === 0 && a.role) await deps.store.notify({ role: a.role, title: a.title, body: a.body, link: a.link });
  for (const p of people) {
    await deps.store.notify({ userId: p.id, title: a.title, body: a.body, link: a.link });
    if (a.whatsapp && p.phone_e164 && deps.channels) {
      await deliver(deps, { kind: "whatsapp", to: p.phone_e164, body: `${a.title}\n${a.body}${a.link ? `\n${deps.channels.appUrl}${a.link}` : ""}`, leadId: a.leadId, weddingId: a.weddingId, subjectTable: "profiles", subjectId: p.id });
    }
  }
  return people.length;
}

// ---------------------------------------------------------------------------
// Delivery: every outbound send is an outbox row.
// ---------------------------------------------------------------------------
export interface DeliverRequest {
  kind: Exclude<OutboundKind, "payment_link" | "esign" | "call">;
  to: string;
  body: string;
  subject?: string | null;
  template?: string;
  location?: { name: string; url: string } | null;
  messageId?: string | null;
  leadId?: string | null;
  weddingId?: string | null;
  subjectTable?: string;
  subjectId?: string;
}

function adapterFor(channels: Integrations, kind: DeliverRequest["kind"]) {
  switch (kind) {
    case "whatsapp": return channels.whatsapp;
    case "email": return channels.email;
    case "sms": return channels.sms;
    case "instagram": return channels.instagram;
    case "web_chat": return null; // the visitor's chat window polls our messages
  }
}

export async function deliver(deps: AgentDeps, r: DeliverRequest): Promise<{ outboxId: string; status: string }> {
  const db = requireDb(deps);
  if (!deps.channels) throw new Error("No channels configured");
  const adapter = adapterFor(deps.channels, r.kind);
  const result = adapter
    ? await adapter.send({ to: r.to, body: r.body, subject: r.subject ?? undefined, template: r.template, location: r.location ?? null }).catch((e: unknown) => ({ provider: adapter.provider, status: "failed" as const, providerRef: null, error: e instanceof Error ? e.message : String(e) }))
    : { provider: "web", status: "sent" as const, providerRef: null };
  const [row] = await db.insert<{ id: string }>("outbox", {
    kind: r.kind, provider: result.provider, to_address: r.to, subject: r.subject ?? null, body: r.body,
    payload: r.location ? { location: r.location } : {}, status: result.status, provider_ref: result.providerRef,
    error: "error" in result ? result.error ?? null : null, attempts: 1, message_id: r.messageId ?? null,
    lead_id: r.leadId ?? null, wedding_id: r.weddingId ?? null, subject_table: r.subjectTable ?? null, subject_id: r.subjectId ?? null,
    sent_at: result.status === "failed" ? null : new Date().toISOString(),
  });
  if (r.messageId) {
    await db.update("messages", { id: r.messageId }, { status: result.status === "failed" ? "failed" : "sent", sent_at: result.status === "failed" ? null : new Date().toISOString() });
  }
  return { outboxId: row!.id, status: result.status };
}

const SENDABLE: MessageChannel[] = ["whatsapp", "email", "instagram", "sms", "web_chat"];

/** Sends every approved outbound message (after Prashanth approves, or straight away above `draft`). */
export async function sendApprovedMessages(deps: AgentDeps, limit = 50): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = requireDb(deps);
  const msgs = await db.select<{ id: string; channel: MessageChannel; to_address: string | null; subject: string | null; body: string; lead_id: string | null; wedding_id: string | null; metadata: Row | null }>("messages", {
    where: { status: "approved", direction: "outbound", channel: where.in(SENDABLE) }, order: [{ column: "created_at" }], limit,
  });
  let sent = 0, failed = 0, skipped = 0;
  for (const m of msgs) {
    if (!m.to_address && m.channel !== "web_chat") { skipped++; await db.update("messages", { id: m.id }, { status: "failed", metadata: { ...(m.metadata ?? {}), error: "No address to send to" } }); continue; }
    const loc = (m.metadata?.location ?? null) as { name: string; url: string } | null;
    const out = await deliver(deps, { kind: m.channel as DeliverRequest["kind"], to: m.to_address ?? "", body: m.body, subject: m.subject, location: loc, messageId: m.id, leadId: m.lead_id, weddingId: m.wedding_id });
    if (out.status === "failed") failed++; else sent++;
  }
  return { sent, failed, skipped };
}

/** Today's date in India (YYYY-MM-DD) for the run's clock. */
export function istDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A wall-clock time in India on a given date, as an ISO instant. */
export function istInstant(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00+05:30`).toISOString();
}
