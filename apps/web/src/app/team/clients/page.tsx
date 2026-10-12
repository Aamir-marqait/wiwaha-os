import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LinkButton } from "./link-button";

export const metadata = { title: "Client portal" };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const ROLE: Record<string, string> = { couple: "Couple", parent: "Parent", planner: "Planner", family: "Family" };

/** Who can sign in to each couple's portal, and a link to send them. */
export default async function ClientsPage() {
  await requireSection("client");
  const supabase = await createClient();
  const today = todayIST();
  const { data: weddings } = await supabase.from("weddings")
    .select("id, title, code, event_start, event_end, members:wedding_members(id, display_name, email, member_role, user_id, accepted_at, contact:contacts(phone_e164))")
    .gte("event_end", today).order("event_start");

  return (
    <>
      <PageTitle title="Client portal" subtitle="Couples and families sign in at /portal/login. Logins are made when a wedding is booked or a family member is added, and stop working after the wedding day." />
      {(weddings ?? []).length === 0 ? <Card className="p-5 text-sm text-ink-soft">No upcoming weddings.</Card> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {(weddings ?? []).map((w) => {
          const members = (w.members ?? []) as { id: string; display_name: string; email: string; member_role: string; user_id: string | null; accepted_at: string | null; contact: { phone_e164: string | null } | { phone_e164: string | null }[] | null }[];
          return (
            <Card key={w.id as string}>
              <CardHeader title={<Link href={`/team/weddings/${w.id as string}`} className="hover:underline">{w.title as string}</Link>} subtitle={`${formatDateIST(w.event_start as string)} · access until the end of ${formatDateIST(w.event_end as string)}`} />
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
