import { Badge, Card, PageTitle, cn } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Activity log" };

function usd(micros: number | null): string {
  return micros ? `$${(micros / 1_000_000).toFixed(4)}` : "—";
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ tab?: string; agent?: string }> }) {
  const viewer = await requireStaff(["owner", "sales", "event_manager", "accounts"]);
  const { tab, agent } = await searchParams;
  const owner = viewer.profile.role === "owner";
  const audit = owner && tab === "audit";
  const supabase = await createClient();

  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Activity log" subtitle={owner ? "Every agent action, and every human edit with user, time and IP address." : "Every agent action."} />
      <div className="mb-4 flex gap-1">
        <Link href="/team/settings/activity" className={cn("rounded-full px-3 py-1.5 text-sm", !audit ? "bg-sage-700 text-white" : "bg-white ring-1 ring-line")}>Agent actions</Link>
        {owner ? <Link href="/team/settings/activity?tab=audit" className={cn("rounded-full px-3 py-1.5 text-sm", audit ? "bg-sage-700 text-white" : "bg-white ring-1 ring-line")}>Edits (audit)</Link> : null}
      </div>
      {audit ? <AuditTable supabase={supabase} /> : <ActionsTable supabase={supabase} agent={agent} />}
    </>
  );
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function ActionsTable({ supabase, agent }: { supabase: Db; agent?: string }) {
  let q = supabase.from("agent_actions").select("id, agent_key, action, status, model, input_tokens, output_tokens, cost_usd_micros, duration_ms, created_at, lead_id, approval_id, approved_at, error, output, policy_versions").order("created_at", { ascending: false }).limit(100);
  if (agent) q = q.eq("agent_key", agent);
  const { data } = await q;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line/70">
        {(data ?? []).length === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-soft">No agent actions yet.</li> : null}
        {(data ?? []).map((a) => {
          const out = (a.output ?? {}) as { score?: number; delivery?: string; flags?: string[]; headline_source?: string; source?: string };
          return (
            <li key={a.id as string} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/team/settings/activity?agent=${a.agent_key}`} className="font-medium hover:underline">{String(a.agent_key).replace(/_/g, " ")}</Link>
                <span className="text-ink-soft">{String(a.action).replace(/_/g, " ")}</span>
                <Badge tone={a.status === "error" ? "burgundy" : a.status === "gated" ? "gold" : a.status === "skipped_disabled" ? "neutral" : "sage"}>{String(a.status).replace(/_/g, " ")}</Badge>
                {a.approved_at ? <Badge tone="solid">approved</Badge> : null}
                <span className="ml-auto text-xs text-ink-soft">{formatDateTimeIST(a.created_at as string)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {out.score !== undefined ? `score ${out.score} · ` : ""}{out.source ? `${out.source} draft · ` : ""}{out.headline_source ? `headline: ${out.headline_source} · ` : ""}{out.flags?.length ? `flags: ${out.flags.join(", ")} · ` : ""}
                {a.model ? `${a.model as string} · ` : ""}{a.input_tokens ? `${a.input_tokens as number}/${a.output_tokens as number} tokens · ${usd(a.cost_usd_micros as number | null)} · ` : ""}{a.duration_ms ? `${a.duration_ms as number} ms` : ""}
                {a.lead_id ? <> · <Link href={`/team/leads/${a.lead_id}`} className="underline">lead</Link></> : null}
              </p>
              {a.error ? <p className="mt-1 text-xs text-burgundy-700">{a.error as string}</p> : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

async function AuditTable({ supabase }: { supabase: Db }) {
  // audit_log has no FK to profiles on purpose (history must survive user deletion), so resolve names here.
  const { data } = await supabase.from("audit_log").select("id, at, user_id, actor_role, table_name, record_id, action, changed_fields, ip, via").order("at", { ascending: false }).limit(150);
  const ids = [...new Set((data ?? []).map((r) => r.user_id as string | null).filter((v): v is string => !!v))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ivory-100 text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">What</th><th className="px-4 py-2">Fields</th><th className="px-4 py-2">IP</th><th className="px-4 py-2">Via</th></tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {(data ?? []).map((r) => {
              const who = r.user_id ? names.get(r.user_id as string) : null;
              return (
                <tr key={r.id as number}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">{formatDateTimeIST(r.at as string)}</td>
                  <td className="px-4 py-2">{who ?? (r.actor_role === "service_role" ? "System / agent" : "—")}<span className="block text-[11px] text-ink-soft">{r.actor_role as string}</span></td>
                  <td className="px-4 py-2">{String(r.action).toLowerCase()} <span className="text-ink-soft">{r.table_name as string}</span></td>
                  <td className="px-4 py-2 text-xs text-ink-soft">{((r.changed_fields as string[] | null) ?? []).slice(0, 5).join(", ")}</td>
                  <td className="px-4 py-2 font-mono text-xs">{(r.ip as string | null) ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{(r.via as string | null) ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
