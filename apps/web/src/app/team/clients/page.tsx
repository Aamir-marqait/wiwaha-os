import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { ActionButton } from "@/components/action-button";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@wiwaha/db";
import { extendPortal } from "./actions";
import { LinkButton } from "./link-button";

export const metadata = { title: "Client portal" };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const ROLE: Record<string, string> = { couple: "Couple", parent: "Parent", planner: "Planner", family: "Family" };

/** Who can sign in to each couple's portal, and a link to send them. */
export default async function ClientsPage() {
  await requireSection("client");
  const supabase = await createClient();
  const today = todayIST();
  const [{ data: weddings }, { data: access }] = await Promise.all([
    supabase.from("weddings")
      .select("id, title, code, event_start, event_end, portal_access_until, members:wedding_members(id, display_name, email, member_role, user_id, accepted_at, contact:contacts(phone_e164))")
      .gte("event_end", addDays(today, -30)).order("event_start"),
    supabase.from("policies").select("value").eq("key", "portal.access").maybeSingle(),
  ]);
  const closeDays = Number((access?.value as { close_days_after_event?: number } | null)?.close_days_after_event ?? 0);

  return (
    <>
      <PageTitle title="Client portal" subtitle="Couples and families sign in at /portal/login. Logins are made when a wedding is booked or a family member is added, and close after the wedding day (policy: Portal access)." />
      {(weddings ?? []).length === 0 ? <Card className="p-5 text-sm text-ink-soft">No upcoming weddings.</Card> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {(weddings ?? []).map((w) => {
          const until = (w.portal_access_until as string | null) ?? addDays(w.event_end as string, closeDays);
          const closed = until < today;
          const members = (w.members ?? []) as { id: string; display_name: string; email: string; member_role: string; user_id: string | null; accepted_at: string | null; contact: { phone_e164: string | null } | { phone_e164: string | null }[] | null }[];
          return (
            <Card key={w.id as string}>
              <CardHeader title={<Link href={`/team/weddings/${w.id as string}`} className="hover:underline">{w.title as string}</Link>} subtitle={`${formatDateIST(w.event_start as string)} · ${closed ? `portal closed after ${formatDateIST(until)}` : `logins work until the end of ${formatDateIST(until)}`}`}
                action={<ActionButton action={extendPortal.bind(null, w.id as string, 7)} variant="ghost">{closed ? "Reopen for 7 days" : "Keep open 7 more days"}</ActionButton>} />
              <ul className="divide-y divide-line/70">
                {members.length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">No portal logins yet. Add family on the wedding page.</li> : null}
                {members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.display_name} <Badge tone="neutral">{ROLE[m.member_role] ?? m.member_role}</Badge></p>
                      <p className="truncate text-xs text-ink-soft">{m.email} · {m.accepted_at ? "has signed in" : "not signed in yet"}</p>
                    </div>
                    <LinkButton memberId={m.id} name={m.display_name} phone={one(m.contact)?.phone_e164 ?? null} />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
