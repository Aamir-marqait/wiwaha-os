import "server-only";
import { createDispatcher, llmFromEnv, morningBrief, processLead, routeTasks, SupabaseAgentStore, type AgentDeps } from "@wiwaha/agents";
import { createAdminClient } from "./supabase/admin";

/** Agents run server-side with the service role; every action is logged to agent_actions. */
export function agentDeps(): AgentDeps {
  return { store: new SupabaseAgentStore(createAdminClient("agent")), llm: llmFromEnv() };
}

export async function runLeadDesk(leadId: string, opts: { force?: boolean } = {}) {
  return processLead(agentDeps(), leadId, opts);
}

export async function runMorningBrief(date?: string) {
  return morningBrief(agentDeps(), { date });
}

export async function runRouting() {
  const deps = agentDeps();
  return routeTasks(deps, createDispatcher(deps));
}
