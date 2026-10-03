import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import type { AppRole } from "@wiwaha/db";
import { formatDateIST } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { requireStaff, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revokeInvite, setActive } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Team" };

export default async function TeamSettings() {
  const viewer = await requireStaff(["owner"]);
  const supabase = await createClient();
  const [people, invites] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, title, active, created_at").neq("role", "client").order("role").order("full_name"),
    supabase.from("staff_invites").select("*").is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Team & invites" subtitle="Staff sign in at /login. Couples and families get their own portal logins from their event manager." />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="People" />
          <ul className="divide-y divide-line/70">
            {(people.data ?? []).map((p) => (
              <li key={p.id as string} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.full_name as string} {!p.active ? <Badge tone="burgundy">Deactivated</Badge> : null}</p>
                  <p className="text-xs text-ink-soft">{(p.title as string | null) ?? ROLE_LABELS[p.role as AppRole]} · {p.email as string}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="sage">{ROLE_LABELS[p.role as AppRole]}</Badge>
                  {p.id !== viewer.userId ? <ActionButton action={setActive.bind(null, p.id as string, !p.active)} variant="ghost" confirm={p.active ? "Deactivate this person? They lose access immediately." : undefined}>{p.active ? "Deactivate" : "Reactivate"}</ActionButton> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Invite someone" subtitle="They'll get an email link to set a password" />
            <div className="p-4"><InviteForm /></div>
          </Card>
          <Card>
            <CardHeader title="Open invites" />
            <ul className="divide-y divide-line/70">
              {(invites.data ?? []).length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">None.</li> : null}
              {(invites.data ?? []).map((i) => (
                <li key={i.id as string} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div><p className="text-sm">{i.full_name as string} · {ROLE_LABELS[i.role as AppRole]}</p><p className="text-xs text-ink-soft">{i.email as string} · expires {formatDateIST(i.expires_at as string)}</p></div>
                  <ActionButton action={revokeInvite.bind(null, i.id as string)} variant="ghost">Revoke</ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
