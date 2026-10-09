import { Card, EmptyState, PageTitle, buttonClass, cn } from "@wiwaha/ui";
import { formatDateIST, type LeadStatus } from "@wiwaha/db";
import Link from "next/link";
import { LeadStatusBadge, ScoreBadge, SOURCE_LABELS } from "@/components/lead-badges";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Leads" };

const TABS: { key: string; label: string; statuses: LeadStatus[] | null }[] = [
  { key: "open", label: "Open", statuses: ["new", "contacted", "visit_booked", "visited", "follow_up_done", "negotiating"] },
  { key: "new", label: "New", statuses: ["new"] },
  { key: "visits", label: "Visits", statuses: ["visit_booked", "visited"] },
  { key: "won", label: "Booked", statuses: ["won"] },
  { key: "closed", label: "Closed", statuses: ["lost", "no_response"] },
  { key: "all", label: "All", statuses: null },
];

type Row = {
  id: string; source: string; status: LeadStatus; score: number | null; hot: boolean; date_wanted: string | null; guest_count: number | null;
  touch_count: number; last_touch_at: string; hold_expires_at: string | null;
  contact: { full_name: string; phone_e164: string | null; email: string | null } | null;
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; hot?: string }> }) {
  const viewer = await requireStaff(["owner", "sales", "event_manager"]);
  const { tab = "open", q = "", hot } = await searchParams;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select("id, source, status, score, hot, date_wanted, guest_count, touch_count, last_touch_at, hold_expires_at, contact:contacts!inner(full_name, phone_e164, email)")
    .order("hot", { ascending: false })
    .order("last_touch_at", { ascending: false })
    .limit(200);
  if (current.statuses) query = query.in("status", current.statuses);
  if (hot) query = query.eq("hot", true);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) {
    const digits = term.replace(/\D/g, "");
    query = digits.length >= 4 ? query.ilike("contact.phone_e164", `%${digits}%`) : query.ilike("contact.full_name", `%${term}%`);
  }
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageTitle
        title="Lead inbox"
        subtitle="Every enquiry, de-duplicated by phone and scored by Lead Desk"
        action={viewer.profile.role !== "event_manager" ? <span className="flex gap-2"><Link href="/team/leads/import" className={buttonClass("secondary")}>Import CSV</Link><Link href="/team/leads/new" className={buttonClass("primary")}>+ New lead</Link></span> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <Link key={t.key} href={`/team/leads?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cn("rounded-full px-3 py-1.5 text-sm whitespace-nowrap", t.key === current.key ? "bg-sage-700 text-white" : "bg-white text-ink-soft ring-1 ring-line hover:bg-ivory-100")}>
              {t.label}
            </Link>
          ))}
          <Link href={`/team/leads?tab=${current.key}${hot ? "" : "&hot=1"}`} className={cn("rounded-full px-3 py-1.5 text-sm whitespace-nowrap", hot ? "bg-burgundy-600 text-white" : "bg-white text-ink-soft ring-1 ring-line")}>🔥 Hot only</Link>
        </div>
        <form className="ml-auto w-full sm:w-64">
          <input type="hidden" name="tab" value={current.key} />
          <input name="q" defaultValue={q} placeholder="Search name or phone" className="h-9 w-full rounded-full border border-line bg-white px-4 text-sm outline-none focus:border-sage-500" />
        </form>
      </div>

      {error ? <p className="text-sm text-burgundy-700">{error.message}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="No leads here">New enquiries from the website form and manual entry land here automatically.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="hidden w-full text-sm md:table">
            <thead className="bg-ivory-100 text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Date wanted</th><th className="px-4 py-3">Guests</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last touch</th></tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-ivory-50">
                  <td className="px-4 py-3"><Link href={`/team/leads/${l.id}`} className="font-medium hover:underline">{l.contact?.full_name}</Link>{l.touch_count > 1 ? <span className="ml-2 text-xs text-ink-soft">×{l.touch_count}</span> : null}<p className="text-xs text-ink-soft">{l.contact?.phone_e164 ?? l.contact?.email}</p></td>
                  <td className="px-4 py-3">{SOURCE_LABELS[l.source] ?? l.source}</td>
                  <td className="px-4 py-3">{l.date_wanted ? formatDateIST(l.date_wanted) : "—"}{l.hold_expires_at && Date.parse(l.hold_expires_at) > Date.now() ? <p className="text-xs text-burgundy-700">Held · expires {relativeFromNow(l.hold_expires_at)}</p> : null}</td>
                  <td className="px-4 py-3">{l.guest_count ?? "—"}</td>
                  <td className="px-4 py-3"><ScoreBadge score={l.score} hot={l.hot} /></td>
                  <td className="px-4 py-3"><LeadStatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-ink-soft">{relativeFromNow(l.last_touch_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line/70 md:hidden">
            {rows.map((l) => (
              <li key={l.id}>
                <Link href={`/team/leads/${l.id}`} className="block px-4 py-3 active:bg-ivory-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{l.contact?.full_name}{l.touch_count > 1 ? <span className="ml-1 text-xs font-normal text-ink-soft">×{l.touch_count}</span> : null}</p>
                    <ScoreBadge score={l.score} hot={l.hot} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    <LeadStatusBadge status={l.status} />
                    <span>{SOURCE_LABELS[l.source] ?? l.source}</span>
                    {l.date_wanted ? <span>· {formatDateIST(l.date_wanted)}</span> : null}
                    {l.guest_count ? <span>· {l.guest_count} guests</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
