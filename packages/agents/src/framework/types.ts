import type {
  AgentActionStatus,
  AgentRow,
  ApprovalKind,
  AppRole,
  HumanQueueReason,
  Json,
  LeadWithContact,
  MessageChannel,
  MessageStatus,
} from "@wiwaha/db";
import type { PolicyRow } from "@wiwaha/policy";

export type AgentKey = string;

/** One logged unit of work (an `agent_actions` row). */
export interface ActionLog {
  agentKey: AgentKey;
  runId: string;
  action: string;
  status: AgentActionStatus;
  leadId?: string | null;
  weddingId?: string | null;
  subjectTable?: string;
  subjectId?: string;
  input?: Json;
  output?: Json;
  toolsUsed?: string[];
  policyKeys?: string[];
  policyVersions?: Record<string, number>;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsdMicros?: number | null;
  durationMs?: number;
  approvalId?: string | null;
  error?: string | null;
}

export interface NewApproval {
  kind: ApprovalKind;
  title: string;
  summary?: string;
  agentKey: AgentKey;
  agentActionId?: string | null;
  leadId?: string | null;
  weddingId?: string | null;
  payload: Json;
  priority?: 1 | 2 | 3;
  guardrailFlags?: string[];
}

export interface NewMessage {
  leadId?: string | null;
  weddingId?: string | null;
  channel: MessageChannel;
  direction: "inbound" | "outbound" | "internal";
  status: MessageStatus;
  authorKind: "agent" | "staff" | "client" | "contact" | "system";
  agentKey?: AgentKey;
  approvalId?: string | null;
  toAddress?: string | null;
  subject?: string | null;
  body: string;
  metadata?: Json;
}

export interface NewHumanQueueItem {
  agentKey: AgentKey | null;
  reason: HumanQueueReason;
  title: string;
  detail?: string;
  payload?: Json;
  leadId?: string | null;
  weddingId?: string | null;
  assignedRole?: AppRole | null;
}

export interface NewNotification {
  userId?: string | null;
  role?: AppRole | null;
  title: string;
  body?: string;
  link?: string;
}

export interface AgentTaskRow {
  id: string;
  from_agent: string | null;
  to_agent: string | null;
  kind: string;
  payload: Json;
  lead_id: string | null;
  wedding_id: string | null;
  status: string;
  created_at: string;
}

/** Facts the Chief of Staff's brief is built from. */
export interface BriefData {
  date: string;
  newLeads: { id: string; name: string; source: string; score: number | null; hot: boolean; dateWanted: string | null; guests: number | null }[];
  hotLeadsWaiting: { id: string; name: string; score: number | null; status: string }[];
  visitsToday: { id: string; leadName: string; at: string; executive: string | null; attendees: string | null }[];
  followUpsDue: { visitId: string; leadName: string; dueAt: string }[];
  holdsExpiring: { id: string; label: string | null; resource: string; startsOn: string; expiresAt: string }[];
  pendingApprovals: { kind: string; count: number; oldestAt: string }[];
  humanQueue: { id: string; title: string; reason: string; createdAt: string }[];
  overdueTasks: { id: string; title: string; owner: string | null; dueAt: string; priority: string; wedding: string | null }[];
  paymentsDue: { id: string; wedding: string; label: string; amountPaise: number; dueOn: string; status: string }[];
  upcomingWeddings: { id: string; title: string; eventStart: string; daysAway: number; guestCount: number | null }[];
  stagesToNudge: { id: string; wedding: string; stage: string; recommendedStart: string }[];
  agentIssues: { agentKey: string; status: string; count: number }[];
  disabledAgents: string[];
}

/**
 * Everything an agent may read or write goes through this interface, so
 * the same agent code runs against Supabase in production and an in-memory
 * store in tests.
 */
export interface AgentStore {
  getAgent(key: AgentKey): Promise<AgentRow | null>;
  loadPolicyRows(): Promise<PolicyRow[]>;
  logAction(log: ActionLog): Promise<string>;
  updateAction(id: string, patch: Partial<Pick<ActionLog, "approvalId" | "status" | "output">>): Promise<void>;
  createApproval(a: NewApproval): Promise<string>;
  createMessage(m: NewMessage): Promise<string>;
  queueHuman(item: NewHumanQueueItem): Promise<string>;
  notify(n: NewNotification): Promise<void>;

  // Lead Desk
  getLead(id: string): Promise<LeadWithContact | null>;
  updateLeadScore(id: string, score: number, breakdown: Json, hot: boolean): Promise<void>;
  /** Spaces free for the date that can seat the guests (ignores enquiry pencil marks). */
  freeSpacesOn(date: string, guests: number | null): Promise<{ id: string; name: string; capacity: number }[]>;
  countRecentRepliesForLead(leadId: string, sinceIso: string): Promise<number>;

  // Chief of Staff
  briefData(dateIso: string): Promise<BriefData>;
  saveBrief(b: { kind: "morning" | "evening"; forDate: string; title: string; contentMd: string; data: Json; agentActionId: string }): Promise<string>;
  queuedAgentTasks(limit: number): Promise<AgentTaskRow[]>;
  updateAgentTask(id: string, patch: { status: string; to_agent?: string | null; routed_by?: string; result?: Json }): Promise<void>;
}

/** Minimal LLM surface the agents use; real impl wraps @anthropic-ai/sdk. */
export interface LlmRequest {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface LlmResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number;
  stopReason: string | null;
}

export interface LlmClient {
  readonly available: boolean;
  complete(req: LlmRequest): Promise<LlmResult>;
}

export interface AgentDeps {
  store: AgentStore;
  llm: LlmClient;
  now?: () => Date;
}
