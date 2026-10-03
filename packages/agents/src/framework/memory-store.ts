import { randomUUID } from "node:crypto";
import type { AgentRow, Json, LeadWithContact } from "@wiwaha/db";
import { AGENT_ROSTER } from "@wiwaha/db";
import { DEFAULT_POLICIES, type PolicyRow } from "@wiwaha/policy";
import type { ActionLog, AgentStore, AgentTaskRow, BriefData, NewApproval, NewHumanQueueItem, NewMessage, NewNotification } from "./types";

type Stored<T> = T & { id: string };

/** In-memory AgentStore for scenario tests. Starts with the seed policy book and roster. */
export class MemoryAgentStore implements AgentStore {
  agents: AgentRow[];
  policies: PolicyRow[];
  actions: Stored<ActionLog>[] = [];
  approvals: Stored<NewApproval>[] = [];
  messages: Stored<NewMessage & { createdAt: string }>[] = [];
  humanQueue: Stored<NewHumanQueueItem>[] = [];
  notifications: NewNotification[] = [];
  leads: LeadWithContact[] = [];
  spaces: { id: string; name: string; capacity: number; takenDates: string[] }[] = [];
  tasks: AgentTaskRow[] = [];
  briefs: { id: string; title: string; contentMd: string; forDate: string }[] = [];
  brief: BriefData | null = null;

  constructor() {
    this.agents = AGENT_ROSTER.map((a) => ({
      key: a.key, name: a.name, vertical: a.vertical, job: a.job, human_gate: a.humanGate, phase: a.phase,
      implemented: true, enabled: true, autonomy: "draft", model: a.model, config: {}, updated_at: new Date().toISOString(),
    }));
    this.policies = DEFAULT_POLICIES.map((p) => ({ ...p, value: structuredClone(p.value) as unknown, version: 1 }));
  }

  setPolicy(key: string, value: unknown, ruleText?: string): void {
    const p = this.policies.find((x) => x.key === key);
    if (!p) throw new Error(`no policy ${key}`);
    p.value = value;
    if (ruleText) p.rule_text = ruleText;
    p.version += 1;
  }

  setAgent(key: string, patch: Partial<AgentRow>): void {
    const a = this.agents.find((x) => x.key === key);
    if (!a) throw new Error(`no agent ${key}`);
    Object.assign(a, patch);
  }

  async getAgent(key: string) { return this.agents.find((a) => a.key === key) ?? null; }
  async loadPolicyRows() { return structuredClone(this.policies); }
  async logAction(l: ActionLog) { const id = randomUUID(); this.actions.push({ ...l, id }); return id; }
  async updateAction(id: string, patch: Partial<Pick<ActionLog, "approvalId" | "status" | "output">>) {
    const a = this.actions.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  }
  async createApproval(a: NewApproval) { const id = randomUUID(); this.approvals.push({ ...a, id }); return id; }
  async createMessage(m: NewMessage) { const id = randomUUID(); this.messages.push({ ...m, id, createdAt: new Date().toISOString() }); return id; }
  async queueHuman(i: NewHumanQueueItem) { const id = randomUUID(); this.humanQueue.push({ ...i, id }); return id; }
  async notify(n: NewNotification) { this.notifications.push(n); }
  async getLead(id: string) { return this.leads.find((l) => l.id === id) ?? null; }
  async updateLeadScore(id: string, score: number, breakdown: Json, hot: boolean) {
    const l = this.leads.find((x) => x.id === id);
    if (l) Object.assign(l, { score, score_breakdown: breakdown, hot });
  }
  async freeSpacesOn(date: string, guests: number | null) {
    return this.spaces.filter((s) => !s.takenDates.includes(date) && (guests === null || s.capacity >= guests)).map(({ id, name, capacity }) => ({ id, name, capacity }));
  }
  async countRecentRepliesForLead(leadId: string, sinceIso: string) {
    return this.messages.filter((m) => m.leadId === leadId && m.authorKind === "agent" && m.createdAt >= sinceIso).length;
  }
  async briefData(date: string): Promise<BriefData> {
    if (!this.brief) throw new Error("no brief data loaded");
    return { ...this.brief, date };
  }
  async saveBrief(b: { kind: "morning" | "evening"; forDate: string; title: string; contentMd: string }) {
    const id = randomUUID();
    this.briefs.push({ id, title: b.title, contentMd: b.contentMd, forDate: b.forDate });
    return id;
  }
  async queuedAgentTasks(limit: number) { return this.tasks.filter((t) => t.status === "queued").slice(0, limit); }
  async claimAgentTask(id: string, toAgent: string) {
    const t = this.tasks.find((x) => x.id === id && x.status === "queued");
    if (!t) return false;
    t.status = "routed";
    t.to_agent = toAgent;
    return true;
  }
  async updateAgentTask(id: string, patch: { status: string; to_agent?: string | null; result?: Json }) {
    const t = this.tasks.find((x) => x.id === id);
    if (t) { t.status = patch.status; if (patch.to_agent !== undefined) t.to_agent = patch.to_agent; }
  }
}
