import { Badge, Card, EmptyState, PageTitle, cn } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import Link from "next/link";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ApprovalCard, type ApprovalView } from "./approval-card";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaff();
  const { show } = await searchParams;
  const decided = show === "decided";
  const supabase = await createClient();
  const [list, agents] = await Promise.all([
    decided
      ? supabase.from("approvals").select("*, decider:profiles!approvals_decided_by_fkey(full_name)").neq("status", "pending").order("decided_at", { ascending: false }).limit(50)
      : supabase.from("approvals").select("*").eq("status", "pending").order("priority").order("created_at").limit(100),
    supabase.from("agents").select("key, name"),
  ]);
  const names = new Map((agents.data ?? []).map((a) => [a.key as string, a.name as string]));
  const rows = list.data ?? [];

  return (
    <>
      <PageTitle title="Approval queue" subtitle="Everything an agent wants to send or commit waits here for a person." />
      <div className="mb-4 flex gap-1">
        <Link href="/team/approvals" className={cn("rounded-full px-3 py-1.5 text-sm", !decided ? "bg-sage-700 text-white" : "bg-white ring-1 ring-line")}>Waiting</Link>
        <Link href="/team/approvals?show=decided" className={cn("rounded-full px-3 py-1.5 text-sm", decided ? "bg-sage-700 text-white" : "bg-white ring-1 ring-line")}>Decided</Link>
      </div>
      {list.error ? <p className="text-sm text-burgundy-700">{list.error.message}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title={decided ? "Nothing decided yet" : "All clear"}>{decided ? "" : "No agent output is waiting for approval."}</EmptyState>
      ) : decided ? (
        <Card>
          <ul className="divide-y divide-line/70">
            {rows.map((a) => {
              const d = (Array.isArray(a.decider) ? a.decider[0] : a.decider) as { full_name: string } | null;
              const p = (a.edited_payload ?? a.payload) as { body?: string };
              return (
                <li key={a.id as string} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.title as string}</p>
                    <Badge tone={a.status === "rejected" ? "burgundy" : "sage"}>{String(a.status)}</Badge>
                  </div>
                  <p className="text-xs text-ink-soft">{d?.full_name ?? "Someone"} · {formatDateTimeIST(a.decided_at as string)}{a.decision_note ? ` · “${a.decision_note as string}”` : ""}</p>
                  {p.body ? <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{p.body}</p> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((a) => {
            const p = (a.payload ?? {}) as { body?: string; enquiry?: string | null; channel?: string; to?: string | null };
            const view: ApprovalView = {
              id: a.id as string, kind: a.kind as string, title: a.title as string, summary: (a.summary as string | null) ?? null,
              agentName: a.agent_key ? names.get(a.agent_key as string) ?? (a.agent_key as string) : null,
              priority: a.priority as number, flags: (a.guardrail_flags as string[]) ?? [], createdAt: a.created_at as string,
              createdLabel: relativeFromNow(a.created_at as string), leadId: (a.lead_id as string | null) ?? null,
              body: typeof p.body === "string" ? p.body : null, enquiry: p.enquiry ?? null, channel: p.channel ?? null, to: p.to ?? null,
            };
            return <ApprovalCard key={view.id} a={view} />;
          })}
        </div>
      )}
    </>
  );
}
