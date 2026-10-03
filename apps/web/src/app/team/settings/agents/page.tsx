import { Card, CardHeader, PageTitle } from "@wiwaha/ui";
import type { AgentAutonomy } from "@wiwaha/db";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AgentRow, type AgentView } from "./agent-row";

export const metadata = { title: "Agents" };

const VERTICALS: Record<string, string> = { all: "Orchestration", sales_marketing: "Sales & Marketing", event_crm: "Event Management & CRM", operations: "Operations" };

export default async function AgentsPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [agents, actions] = await Promise.all([
    supabase.from("agents").select("*").order("phase").order("name"),
    supabase.from("agent_actions").select("agent_key, status").gte("created_at", since),
  ]);
  const runs = new Map<string, { runs: number; gated: number }>();
  for (const a of actions.data ?? []) {
    const r = runs.get(a.agent_key as string) ?? { runs: 0, gated: 0 };
    r.runs++;
    if (a.status === "gated") r.gated++;
    runs.set(a.agent_key as string, r);
  }
  const groups = new Map<string, AgentView[]>();
  for (const a of agents.data ?? []) {
    const v: AgentView = {
      key: a.key as string, name: a.name as string, job: a.job as string, humanGate: a.human_gate as string, phase: a.phase as number,
      implemented: a.implemented as boolean, enabled: a.enabled as boolean, autonomy: a.autonomy as AgentAutonomy, model: a.model as string,
      runs24h: runs.get(a.key as string)?.runs ?? 0, gated24h: runs.get(a.key as string)?.gated ?? 0,
    };
    groups.set(a.vertical as string, [...(groups.get(a.vertical as string) ?? []), v]);
  }
  const canEdit = viewer.profile.role === "owner";

  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Agents" subtitle="Every agent ships in Draft. Move one to Act & notify only after weeks of clean drafts approved unedited. Pausing an agent sends its work to the human queue." />
      {!canEdit ? <p className="mb-4 text-sm text-ink-soft">Only the owner can change the dial, kill switch or model.</p> : null}
      <div className="space-y-5">
        {["all", "sales_marketing", "event_crm", "operations"].map((v) => (
          <Card key={v}>
            <CardHeader title={VERTICALS[v]} />
            <ul className="divide-y divide-line/70">{(groups.get(v) ?? []).map((a) => <AgentRow key={a.key} a={a} canEdit={canEdit} />)}</ul>
          </Card>
        ))}
      </div>
    </>
  );
}
