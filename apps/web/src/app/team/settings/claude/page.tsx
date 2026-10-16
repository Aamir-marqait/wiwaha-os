import { Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { CopyField } from "@/components/copy-field";
import { requireStaff, ROLE_LABELS } from "@/lib/auth";
import { allowedRoles, resourceUrl } from "@/lib/mcp/oauth";
import { createClient } from "@/lib/supabase/server";
import { disconnectClaude } from "./actions";

export const metadata = { title: "Claude connector" };

/** Use Wiwaha OS from Claude (claude.ai, desktop or phone): how to connect, and who is connected. */
export default async function ClaudeConnectorPage() {
  const viewer = await requireStaff();
  const owner = viewer.profile.role === "owner";
  const supabase = await createClient();
  // Refresh tokens stand for a live connection (they last 30 days and rotate).
  const { data: live } = await supabase.from("mcp_tokens").select("user_id, client_id, created_at, last_used_at, expires_at").eq("kind", "refresh").is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  const ids = [...new Set((live ?? []).map((t) => t.user_id as string))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, role").in("id", ids) : { data: [] };
  const roles = allowedRoles();
  const canUse = roles.includes(viewer.profile.role);
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Claude connector" subtitle="Ask Claude about Wiwaha and let it act for you: today's priorities, approvals, costing, payments, décor, tasks and more. It acts as you, with your permissions, and every change is logged." />
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader title="Connect" subtitle={canUse ? "Works on Claude Pro, Max, Team and Enterprise." : `Switched on for ${roles.map((r) => ROLE_LABELS[r]).join(", ")} accounts for now.`} />
          <div className="space-y-3 p-4 text-sm">
            <CopyField label="Connector URL" value={resourceUrl()} />
            <ol className="list-decimal space-y-1 pl-5">
              <li>In Claude, open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>.</li>
              <li>Name it <strong>Wiwaha OS</strong> and paste the URL above. Leave the advanced settings empty.</li>
              <li>Press <strong>Connect</strong>. Sign in to Wiwaha OS when asked, then press <strong>Allow</strong>.</li>
              <li>In a chat, turn the connector on (the tools menu) and ask, for example: &ldquo;What needs my attention at Wiwaha today?&rdquo;</li>
            </ol>
            <p className="text-xs text-ink-soft">Once added on claude.ai it also works in the Claude desktop and phone apps.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Connected" subtitle="Each connection lasts 30 days unless it's used; disconnecting stops it at once." />
          <ul className="divide-y divide-line/70">
            {(live ?? []).length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">No one is connected.</li> : null}
            {(live ?? []).map((t, n) => {
              const p = (people ?? []).find((x) => x.id === t.user_id);
              return (
                <li key={n} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="text-sm"><p className="font-medium">{(p?.full_name as string | undefined) ?? "Someone"}</p><p className="text-xs text-ink-soft">since {formatDateTimeIST(t.created_at as string)}</p></div>
                  {owner || t.user_id === viewer.userId ? <ActionButton action={disconnectClaude.bind(null, t.user_id as string)} variant="ghost" confirm="Disconnect Claude for this person? They'll need to connect again.">Disconnect</ActionButton> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
