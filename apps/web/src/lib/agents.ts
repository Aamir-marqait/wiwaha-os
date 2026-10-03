import "server-only";
import { createDispatcher, llmFromEnv, morningBrief, processLead, routeTasks, runTick, SupabaseAgentStore, SupabaseDb, type AgentDeps, type PortalAuth } from "@wiwaha/agents";
import { createIntegrations } from "@wiwaha/integrations";
import { env } from "./env";
import { createAdminClient } from "./supabase/admin";

/** Portal logins through Supabase Auth (the invite email comes from Supabase). */
function portalAuth(): PortalAuth {
  return {
    async inviteClient({ email, fullName, redirectTo }) {
      const admin = createAdminClient("agent");
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo });
      if (error && !/already been registered|already exists/i.test(error.message)) return { ok: false, error: error.message };
      return { ok: true };
    },
  };
}

/**
 * Agents run server-side with the service role; every action is logged to
 * agent_actions. Channels stay in sandbox until provider keys are set.
 */
export function agentDeps(): AgentDeps {
  const client = createAdminClient("agent");
  return {
    store: new SupabaseAgentStore(client),
    llm: llmFromEnv(),
    db: new SupabaseDb(client),
    channels: createIntegrations({ ...process.env, NEXT_PUBLIC_APP_URL: env.appUrl() }),
    auth: portalAuth(),
  };
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

export async function runScheduledTick() {
  return runTick(agentDeps());
}
