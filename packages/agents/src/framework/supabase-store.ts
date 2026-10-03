import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRow, Json, LeadWithContact } from "@wiwaha/db";
import { addDays } from "@wiwaha/db";
import type { PolicyRow } from "@wiwaha/policy";
import type { ActionLog, AgentStore, AgentTaskRow, BriefData, NewApproval, NewHumanQueueItem, NewMessage, NewNotification } from "./types";

/** Throws on a Supabase error so agent runs are logged as errors, never silently wrong. */
function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

interface Named { full_name: string | null }
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * AgentStore backed by Supabase. Use a service-role client: agents run
 * server-side, and every write they make is logged in agent_actions and
 * audited by the database triggers.
 */
export class SupabaseAgentStore implements AgentStore {
  constructor(private readonly db: SupabaseClient) {}

  async getAgent(key: string): Promise<AgentRow | null> {
    return must(await this.db.from("agents").select("*").eq("key", key).maybeSingle(), "load agent") as AgentRow | null;
  }

  async loadPolicyRows(): Promise<PolicyRow[]> {
    return must(await this.db.from("policies").select("key, topic, title, rule_text, value, version, client_visible, needs_confirmation, sort"), "load policies") as PolicyRow[];
  }

  async logAction(l: ActionLog): Promise<string> {
    const row = must(
      await this.db.from("agent_actions").insert({
        agent_key: l.agentKey, run_id: l.runId, action: l.action, status: l.status,
        lead_id: l.leadId ?? null, wedding_id: l.weddingId ?? null,
        subject_table: l.subjectTable ?? null, subject_id: l.subjectId ?? null,
        input: l.input ?? {}, output: l.output ?? {}, tools_used: l.toolsUsed ?? [],
        policy_keys: l.policyKeys ?? [], policy_versions: l.policyVersions ?? {},
        model: l.model ?? null, input_tokens: l.inputTokens ?? null, output_tokens: l.outputTokens ?? null,
        cost_usd_micros: l.costUsdMicros ?? null, duration_ms: l.durationMs ?? null,
        approval_id: l.approvalId ?? null, error: l.error ?? null,
      }).select("id").single(),
      "log agent action",
    ) as { id: string };
    return row.id;
  }

  async updateAction(id: string, patch: Partial<Pick<ActionLog, "approvalId" | "status" | "output">>): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.approvalId !== undefined) update.approval_id = patch.approvalId;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.output !== undefined) update.output = patch.output;
    must(await this.db.from("agent_actions").update(update).eq("id", id), "update agent action");
  }

  async createApproval(a: NewApproval): Promise<string> {
    const row = must(
      await this.db.from("approvals").insert({
        kind: a.kind, title: a.title, summary: a.summary ?? null, agent_key: a.agentKey,
        agent_action_id: a.agentActionId ?? null, lead_id: a.leadId ?? null, wedding_id: a.weddingId ?? null,
        payload: a.payload, priority: a.priority ?? 2, guardrail_flags: a.guardrailFlags ?? [],
      }).select("id").single(),
      "create approval",
    ) as { id: string };
    return row.id;
  }

  async createMessage(m: NewMessage): Promise<string> {
    const row = must(
      await this.db.from("messages").insert({
        lead_id: m.leadId ?? null, wedding_id: m.weddingId ?? null, channel: m.channel, direction: m.direction,
        status: m.status, author_kind: m.authorKind, agent_key: m.agentKey ?? null, approval_id: m.approvalId ?? null,
        to_address: m.toAddress ?? null, subject: m.subject ?? null, body: m.body, metadata: m.metadata ?? {},
      }).select("id").single(),
      "create message",
    ) as { id: string };
    return row.id;
  }

  async queueHuman(i: NewHumanQueueItem): Promise<string> {
    const row = must(
      await this.db.from("human_queue").insert({
        agent_key: i.agentKey, reason: i.reason, title: i.title, detail: i.detail ?? null, payload: i.payload ?? {},
        lead_id: i.leadId ?? null, wedding_id: i.weddingId ?? null, assigned_role: i.assignedRole ?? null,
      }).select("id").single(),
      "queue for a human",
    ) as { id: string };
    return row.id;
  }

  async notify(n: NewNotification): Promise<void> {
    must(await this.db.from("notifications").insert({ user_id: n.userId ?? null, role: n.userId ? null : n.role ?? null, title: n.title, body: n.body ?? null, link: n.link ?? null }), "notify");
  }

  async getLead(id: string): Promise<LeadWithContact | null> {
    return must(
      await this.db.from("leads").select("*, contact:contacts(id, full_name, phone_e164, email, city)").eq("id", id).maybeSingle(),
      "load lead",
    ) as LeadWithContact | null;
  }

  async updateLeadScore(id: string, score: number, breakdown: Json, hot: boolean): Promise<void> {
    must(await this.db.from("leads").update({ score, score_breakdown: breakdown, hot }).eq("id", id), "update lead score");
  }

  async freeSpacesOn(date: string, guests: number | null): Promise<{ id: string; name: string; capacity: number }[]> {
    const spaces = must(await this.db.from("spaces").select("id, name, capacity_seated, capacity_floating").eq("active", true).order("sort"), "load spaces") as
      { id: string; name: string; capacity_seated: number; capacity_floating: number | null }[];
    const nowIso = new Date().toISOString();
    const blocked = must(
      await this.db.from("calendar_entries").select("space_id, status, expires_at")
        .eq("resource_kind", "space").lte("starts_on", date).gte("ends_on", date).in("status", ["held", "confirmed"]),
      "load calendar",
    ) as { space_id: string; status: string; expires_at: string | null }[];
    const taken = new Set(blocked.filter((b) => b.status === "confirmed" || (b.expires_at && b.expires_at > nowIso)).map((b) => b.space_id));
    return spaces
      .filter((s) => !taken.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, capacity: Math.max(s.capacity_seated, s.capacity_floating ?? 0) }))
      .filter((s) => guests === null || s.capacity >= guests);
  }

  async countRecentRepliesForLead(leadId: string, sinceIso: string): Promise<number> {
    const res = await this.db.from("messages").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("author_kind", "agent").gte("created_at", sinceIso);
    if (res.error) throw new Error(`count replies: ${res.error.message}`);
    return res.count ?? 0;
  }

  async briefData(date: string): Promise<BriefData> {
    const now = new Date();
    const dayStart = `${date}T00:00:00+05:30`;
    const dayEnd = `${addDays(date, 1)}T00:00:00+05:30`;
    const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const in48h = new Date(now.getTime() + 48 * 3600_000).toISOString();

    const [newLeads, hot, visits, followUps, holds, approvals, queue, tasks, payments, weddings, stages, actions, agents] = await Promise.all([
      this.db.from("leads").select("id, source, score, hot, date_wanted, guest_count, contact:contacts(full_name)").gte("created_at", since24h).order("score", { ascending: false }),
      this.db.from("leads").select("id, score, status, contact:contacts(full_name)").eq("hot", true).in("status", ["new", "contacted"]),
      this.db.from("visits").select("id, scheduled_at, attendees, executive:profiles(full_name), lead:leads(contact:contacts(full_name))").gte("scheduled_at", dayStart).lt("scheduled_at", dayEnd).eq("status", "scheduled").order("scheduled_at"),
      this.db.from("visits").select("id, follow_up_due_at, lead:leads(contact:contacts(full_name))").eq("follow_up_outcome", "pending").eq("status", "completed").lt("follow_up_due_at", dayEnd),
      this.db.from("calendar_entries").select("id, label, starts_on, expires_at, space:spaces(name), room:rooms(number)").eq("status", "held").gt("expires_at", now.toISOString()).lte("expires_at", in48h).order("expires_at"),
      this.db.from("approvals").select("kind, created_at").eq("status", "pending"),
      this.db.from("human_queue").select("id, title, reason, created_at").neq("status", "done").order("created_at"),
      this.db.from("tasks").select("id, title, due_at, priority, owner:profiles!tasks_owner_id_fkey(full_name), wedding:weddings(title)").in("status", ["todo", "in_progress", "blocked"]).lt("due_at", now.toISOString()).order("due_at"),
      this.db.from("payments").select("id, label, amount_paise, due_on, status, wedding:weddings(title)").in("status", ["scheduled", "link_sent", "overdue"]).lte("due_on", addDays(date, 7)).order("due_on"),
      this.db.from("weddings").select("id, title, event_start, guest_count").in("status", ["active", "tentative"]).gte("event_start", date).lte("event_start", addDays(date, 45)).order("event_start"),
      this.db.from("wedding_stages").select("id, name, recommended_start, snoozed_until, wedding:weddings(title)").is("started_at", null).eq("status", "not_started").lte("recommended_start", date),
      this.db.from("agent_actions").select("agent_key, status").gte("created_at", since24h).in("status", ["error", "blocked", "escalated", "skipped_disabled"]),
      this.db.from("agents").select("name, enabled, implemented").eq("implemented", true).eq("enabled", false),
    ]);

    type R = Record<string, unknown>;
    const rows = (r: { data: unknown; error: { message: string } | null }, what: string): R[] => must(r, what) as R[];
    const nameOf = (v: unknown) => (one(v as Named | Named[] | null)?.full_name ?? null);
    const titleOf = (v: unknown) => (one(v as { title: string } | { title: string }[] | null)?.title ?? null);
    const leadName = (v: unknown) => nameOf(one(v as { contact: unknown } | { contact: unknown }[] | null)?.contact) ?? "Unknown";

    const approvalGroups = new Map<string, { count: number; oldestAt: string }>();
    for (const a of rows(approvals, "approvals")) {
      const g = approvalGroups.get(a.kind as string);
      const at = a.created_at as string;
      if (!g) approvalGroups.set(a.kind as string, { count: 1, oldestAt: at });
      else { g.count++; if (at < g.oldestAt) g.oldestAt = at; }
    }
    const issueGroups = new Map<string, number>();
    for (const a of rows(actions, "agent actions")) {
      const k = `${a.agent_key as string}|${a.status as string}`;
      issueGroups.set(k, (issueGroups.get(k) ?? 0) + 1);
    }

    return {
      date,
      newLeads: rows(newLeads, "new leads").map((l) => ({ id: l.id as string, name: nameOf(l.contact) ?? "Unknown", source: l.source as string, score: (l.score as number | null) ?? null, hot: !!l.hot, dateWanted: (l.date_wanted as string | null) ?? null, guests: (l.guest_count as number | null) ?? null })),
      hotLeadsWaiting: rows(hot, "hot leads").map((l) => ({ id: l.id as string, name: nameOf(l.contact) ?? "Unknown", score: (l.score as number | null) ?? null, status: l.status as string })),
      visitsToday: rows(visits, "visits").map((v) => ({ id: v.id as string, leadName: leadName(v.lead), at: v.scheduled_at as string, executive: nameOf(v.executive), attendees: (v.attendees as string | null) ?? null })),
      followUpsDue: rows(followUps, "follow-ups").map((v) => ({ visitId: v.id as string, leadName: leadName(v.lead), dueAt: v.follow_up_due_at as string })),
      holdsExpiring: rows(holds, "holds").map((h) => ({ id: h.id as string, label: (h.label as string | null) ?? null, resource: (one(h.space as { name: string } | null)?.name ?? (one(h.room as { number: string } | null) ? `Room ${one(h.room as { number: string } | null)!.number}` : "Resource")), startsOn: h.starts_on as string, expiresAt: h.expires_at as string })),
      pendingApprovals: [...approvalGroups.entries()].map(([kind, g]) => ({ kind, ...g })),
      humanQueue: rows(queue, "human queue").map((h) => ({ id: h.id as string, title: h.title as string, reason: h.reason as string, createdAt: h.created_at as string })),
      overdueTasks: rows(tasks, "tasks").map((t) => ({ id: t.id as string, title: t.title as string, owner: nameOf(t.owner), dueAt: t.due_at as string, priority: t.priority as string, wedding: titleOf(t.wedding) })),
      paymentsDue: rows(payments, "payments").map((p) => ({ id: p.id as string, wedding: titleOf(p.wedding) ?? "Wedding", label: p.label as string, amountPaise: Number(p.amount_paise), dueOn: p.due_on as string, status: (p.due_on as string) < date ? "overdue" : (p.status as string) })),
      upcomingWeddings: rows(weddings, "weddings").map((w) => ({ id: w.id as string, title: w.title as string, eventStart: w.event_start as string, daysAway: Math.round((Date.parse(`${w.event_start as string}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000), guestCount: (w.guest_count as number | null) ?? null })),
      stagesToNudge: rows(stages, "stages").filter((s) => !s.snoozed_until || (s.snoozed_until as string) < date).map((s) => ({ id: s.id as string, wedding: titleOf(s.wedding) ?? "Wedding", stage: s.name as string, recommendedStart: s.recommended_start as string })),
      agentIssues: [...issueGroups.entries()].map(([k, count]) => { const [agentKey, status] = k.split("|") as [string, string]; return { agentKey, status, count }; }),
      disabledAgents: rows(agents, "agents").map((a) => a.name as string),
    };
  }

  async saveBrief(b: { kind: "morning" | "evening"; forDate: string; title: string; contentMd: string; data: Json; agentActionId: string }): Promise<string> {
    must(await this.db.from("briefs").delete().eq("kind", b.kind).eq("for_date", b.forDate).is("recipient_id", null), "replace brief");
    const row = must(
      await this.db.from("briefs").insert({ kind: b.kind, for_date: b.forDate, title: b.title, content_md: b.contentMd, data: b.data, agent_action_id: b.agentActionId }).select("id").single(),
      "save brief",
    ) as { id: string };
    return row.id;
  }

  async queuedAgentTasks(limit: number): Promise<AgentTaskRow[]> {
    return must(await this.db.from("agent_tasks").select("*").eq("status", "queued").order("created_at").limit(limit), "load agent tasks") as AgentTaskRow[];
  }

  async updateAgentTask(id: string, patch: { status: string; to_agent?: string | null; routed_by?: string; result?: Json }): Promise<void> {
    const update: Record<string, unknown> = { status: patch.status };
    if (patch.to_agent !== undefined) update.to_agent = patch.to_agent;
    if (patch.routed_by) { update.routed_by = patch.routed_by; update.routed_at = new Date().toISOString(); }
    if (patch.result !== undefined) update.result = patch.result;
    must(await this.db.from("agent_tasks").update(update).eq("id", id), "update agent task");
  }
}
