import { randomUUID } from "node:crypto";
import type { AgentRow, Json } from "@wiwaha/db";
import { PolicyBook } from "@wiwaha/policy";
import type { GuardrailFlag } from "./guardrails";
import type { ActionLog, AgentDeps, AgentKey } from "./types";

export interface RunContext {
  agent: AgentRow;
  book: PolicyBook;
  runId: string;
  deps: AgentDeps;
  now: Date;
  /** Logs one agent_actions row stamped with this run. */
  log(entry: Omit<ActionLog, "agentKey" | "runId">): Promise<string>;
}

export type RunOutcome<T> =
  | { status: "done"; result: T; runId: string }
  | { status: "disabled"; runId: string; queueId: string }
  | { status: "error"; runId: string; error: string };

export interface RunOptions {
  action: string;
  leadId?: string | null;
  weddingId?: string | null;
  input?: Json;
  /** What a human should do if the agent is switched off. */
  fallbackTitle: string;
}

/**
 * Every agent run goes through here, which enforces:
 *  - kill switch: a disabled agent's work lands in the human queue
 *  - policy book: loaded fresh on every run (edits apply immediately)
 *  - logging: errors are logged and escalated, never swallowed
 */
export async function runAgent<T>(deps: AgentDeps, agentKey: AgentKey, opts: RunOptions, body: (ctx: RunContext) => Promise<T>): Promise<RunOutcome<T>> {
  const runId = randomUUID();
  const started = Date.now();
  const now = deps.now?.() ?? new Date();
  const agent = await deps.store.getAgent(agentKey);

  if (!agent || !agent.enabled) {
    const queueId = await deps.store.queueHuman({
      agentKey: agent ? agentKey : null,
      reason: "agent_disabled",
      title: opts.fallbackTitle,
      detail: agent ? `${agent.name} is switched off, so this needs a person.` : `Agent "${agentKey}" is not registered.`,
      payload: opts.input ?? {},
      leadId: opts.leadId ?? null,
      weddingId: opts.weddingId ?? null,
    });
    if (agent) {
      await deps.store.logAction({
        agentKey, runId, action: opts.action, status: "skipped_disabled",
        leadId: opts.leadId, weddingId: opts.weddingId, input: opts.input ?? {},
        output: { human_queue_id: queueId }, durationMs: Date.now() - started,
      });
    }
    return { status: "disabled", runId, queueId };
  }

  const book = PolicyBook.fromRows(await deps.store.loadPolicyRows());
  const ctx: RunContext = {
    agent,
    book,
    runId,
    deps,
    now,
    log: (entry) => deps.store.logAction({ agentKey, runId, ...entry }),
  };

  try {
    const result = await body(ctx);
    return { status: "done", result, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.store.logAction({
      agentKey, runId, action: opts.action, status: "error",
      leadId: opts.leadId, weddingId: opts.weddingId, input: opts.input ?? {},
      error: message, durationMs: Date.now() - started,
    });
    await deps.store.queueHuman({
      agentKey,
      reason: "error",
      title: opts.fallbackTitle,
      detail: `${agent.name} hit a problem: ${message}`,
      payload: opts.input ?? {},
      leadId: opts.leadId ?? null,
      weddingId: opts.weddingId ?? null,
    });
    return { status: "error", runId, error: message };
  }
}

export type Delivery = "approval" | "notify" | "silent";

/**
 * The autonomy dial. `draft` always needs approval; any guardrail flag also
 * forces approval whatever the dial says.
 */
export function decideDelivery(agent: Pick<AgentRow, "autonomy">, flags: readonly GuardrailFlag[]): Delivery {
  if (agent.autonomy === "draft" || flags.length > 0) return "approval";
  return agent.autonomy === "act_and_notify" ? "notify" : "silent";
}
