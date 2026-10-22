import { Card, CardHeader, PageTitle, Stat } from "@wiwaha/ui";
import { addDays, formatDateIST, formatDateTimeIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { SOURCE_LABELS } from "@/components/lead-badges";
import { relativeFromNow } from "@/components/time";
import { requireStaff, viewerSections } from "@/lib/auth";
import { aiSpend } from "@/lib/media/spend";
import { STAGES, stageOf } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";
import { markNotificationRead } from "./actions";

export const metadata = { title: "Dashboard" };

type Named = { full_name: string; phone_e164?: string | null } | null;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** A labelled bar: the number is written beside it, the bar shows the size (D44). */
function Bar({ label, n, max, href, tone = "sage" }: { label: string; n: number; max: number; href?: string; tone?: "sage" | "muted" | "gold" }) {
  const w = max ? Math.max(n ? 3 : 0, Math.round((n / max) * 100)) : 0;
  const fill = tone === "muted" ? "bg-ink-soft/40" : tone === "gold" ? "bg-gold-500" : "bg-sage-600";
  const row = (
    <div className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm" title={`${label}: ${n}`}>
      <span className="truncate text-ink-soft">{label}</span>
      <span className="h-2.5 rounded-full bg-ivory-100"><span className={`block h-2.5 rounded-full ${fill}`} style={{ width: `${w}%` }} /></span>
      <span className="text-right font-medium tabular-nums">{n}</span>
    </div>
  );
  return href ? <Link href={href} className="block rounded-lg px-1 py-0.5 hover:bg-ivory-50">{row}</Link> : <div className="px-1 py-0.5">{row}</div>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const viewer = await requireStaff();
  const { denied } = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const month = `${today.slice(0, 7)}-01`;
  const monthStart = `${month}T00:00:00+05:30`;
  const role = viewer.profile.role;
  const sections = viewerSections(viewer);
  const seesSales = sections.includes("sales_marketing") && ["owner", "sales", "event_manager"].includes(role);
  const seesWeddings = sections.includes("weddings");
  const seesMoney = ["owner", "accounts", "sales", "event_manager"].includes(role) && seesWeddings;
  const seesSpend = ["owner", "accounts"].includes(role);
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const none = Promise.resolve({ data: [] as never[] });

  const [leads, visits, followUps, weddings, payments, notes, queue, guestAsks, spend] = await Promise.all([
    seesSales ? supabase.from("leads").select("status, source, heard_about, created_at").order("created_at", { ascending: false }).limit(3000) : none,
    seesSales ? supabase.from("visits").select("id, scheduled_at, status, attendees, lead:leads(id, contact:contacts(full_name))").gte("scheduled_at", monthStart).lt("scheduled_at", `${addDays(today, 8)}T00:00:00+05:30`).order("scheduled_at") : none,
    seesSales ? supabase.from("visits").select("id, follow_up_due_at, lead:leads(id, contact:contacts(full_name, phone_e164))").eq("follow_up_outcome", "pending").not("follow_up_due_at", "is", null).lte("follow_up_due_at", soon).order("follow_up_due_at").limit(6) : none,
    seesWeddings ? supabase.from("weddings").select("id, title, event_start, created_at, stage").gte("event_start", addDays(today, -1)).order("event_start").limit(200) : none,
    seesMoney ? supabase.from("payments").select("amount_paise, due_on, status").in("status", ["scheduled", "link_sent", "overdue"]).lte("due_on", addDays(today, 30)) : none,
    supabase.from("notifications").select("id, title, body, link, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("human_queue").select("id, title, detail, created_at, lead_id").neq("status", "done").order("created_at", { ascending: false }).limit(4),
    ["owner", "event_manager"].includes(role) ? supabase.from("guest_requests").select("id", { count: "exact", head: true }).eq("status", "new") : Promise.resolve({ count: 0 }),
    seesSpend ? aiSpend().catch(() => null) : Promise.resolve(null),
  ]);

  // Sales: pipeline by stage, this month's enquiries, where they come from (90 days).
  const allLeads = (leads.data ?? []) as { status: string; source: string; heard_about: string | null; created_at: string }[];
  const byStage = new Map<string, number>(STAGES.map((s) => [s.key, 0]));
  for (const l of allLeads) byStage.set(stageOf(l.status).key, (byStage.get(stageOf(l.status).key) ?? 0) + 1);
  const stageMax = Math.max(1, ...byStage.values());
  const newThisMonth = allLeads.filter((l) => l.created_at >= monthStart).length;
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const recent = allLeads.filter((l) => l.created_at >= since90);
  const bySource = new Map<string, number>();
  for (const l of recent) { const k = l.heard_about || SOURCE_LABELS[l.source] || l.source; bySource.set(k, (bySource.get(k) ?? 0) + 1); }
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const topSources = sources.slice(0, 6);
  const otherSources = sources.slice(6).reduce((s, [, n]) => s + n, 0);
  const sourceMax = Math.max(1, ...topSources.map(([, n]) => n), otherSources);
  const won90 = recent.filter((l) => l.status === "won").length;

  // Visits this month (done) and the week ahead.
  const allVisits = (visits.data ?? []) as { id: string; scheduled_at: string; status: string; attendees: string | null; lead: unknown }[];
  const visitsDone = allVisits.filter((v) => v.status === "completed" || (v.status === "scheduled" && v.scheduled_at < new Date().toISOString())).length;
  const upcomingVisits = allVisits.filter((v) => v.status === "scheduled" && v.scheduled_at >= new Date().toISOString()).slice(0, 6);

  // Weddings and money.
  const allWeddings = (weddings.data ?? []) as { id: string; title: string; event_start: string; created_at: string; stage: string }[];
  const next90 = allWeddings.filter((w) => w.event_start <= addDays(today, 90));
  const bookedThisMonth = allWeddings.filter((w) => w.created_at >= monthStart).length;
  const due = (payments.data ?? []) as { amount_paise: number; due_on: string; status: string }[];
  const dueTotal = due.reduce((s, p) => s + Number(p.amount_paise), 0);
  const overdue = due.filter((p) => p.status === "overdue" || p.due_on < today).length;

  const attention = [
    ...((queue.data ?? []) as { id: string; title: string; detail: string | null; created_at: string; lead_id: string | null }[]).map((q) => ({ id: `q${q.id}`, title: q.title, body: q.detail, link: q.lead_id ? `/team/leads/${q.lead_id}` : null, at: q.created_at, note: null as string | null })),
    ...((notes.data ?? []) as { id: string; title: string; body: string | null; link: string | null; created_at: string }[]).map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, at: n.created_at, note: n.id })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const guestCount = "count" in guestAsks ? guestAsks.count ?? 0 : 0;
  const hello = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date());
  const greeting = Number(hello) < 12 ? "Good morning" : Number(hello) < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      {denied ? <p className="mb-4 rounded-xl bg-burgundy-50 px-4 py-2 text-sm text-burgundy-700">{denied === "1" ? "That page is for another role." : `You don’t have access to ${denied}. Ask Prashanth if you need it.`}</p> : null}
      <PageTitle title={`${greeting}, ${viewer.profile.full_name.split(" ")[0]}`} subtitle={formatDateIST(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {seesSales ? <Stat label="Enquiries this month" value={newThisMonth} hint={<Link href="/team/leads" className="underline">Leads</Link>} /> : null}
        {seesSales ? <Stat label="Visits this month" value={visitsDone} hint={`${upcomingVisits.length} in the next week`} tone="gold" /> : null}
        {seesWeddings ? <Stat label="Booked this month" value={bookedThisMonth} tone="burgundy" /> : null}
        {seesSales ? <Stat label="Enquiry → booked" value={pct(won90, recent.length)} hint="last 90 days" /> : null}
        {seesWeddings ? <Stat label="Weddings, next 90 days" value={next90.length} hint={<Link href="/team/weddings" className="underline">Weddings</Link>} /> : null}
        {seesMoney ? <Stat label="Due in 30 days" value={rupees(dueTotal, { compact: true })} hint={overdue ? `${overdue} overdue` : `${due.length} payment${due.length === 1 ? "" : "s"}`} tone={overdue ? "burgundy" : "sage"} /> : null}
      </div>

      <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
        {seesSales ? (
          <Card>
            <CardHeader title="Pipeline" subtitle="Every lead by stage; tap a stage to see them" action={<Link href="/team/leads" className="text-sm text-sage-700 underline">All leads</Link>} />
            <div className="space-y-1 px-3 pb-4 sm:px-4">
              {STAGES.map((s) => <Bar key={s.key} label={s.label} n={byStage.get(s.key) ?? 0} max={stageMax} href={`/team/leads?stage=${s.key}`} tone={s.key === "lost" ? "muted" : s.key === "won" ? "gold" : "sage"} />)}
            </div>
          </Card>
        ) : null}

        {seesSales ? (
          <Card>
            <CardHeader title="Where leads come from" subtitle={`"How did you hear about us", last 90 days (${recent.length} leads)`} />
            <div className="space-y-1 px-3 pb-4 sm:px-4">
              {topSources.length === 0 ? <p className="px-1 text-sm text-ink-soft">No enquiries in the last 90 days.</p> : null}
              {topSources.map(([k, n]) => <Bar key={k} label={k} n={n} max={sourceMax} />)}
              {otherSources ? <Bar label="Everything else" n={otherSources} max={sourceMax} tone="muted" /> : null}
            </div>
          </Card>
        ) : null}

        {seesSales ? (
          <Card>
            <CardHeader title="Coming up" subtitle="Site visits this week, and the one follow-up call after each visit" />
            <ul className="divide-y divide-line/70">
              {upcomingVisits.length === 0 && (followUps.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing in the next week.</li> : null}
              {upcomingVisits.map((v) => {
                const lead = one(v.lead as { id: string; contact: Named | Named[] } | null);
                const c = one(lead?.contact);
                return (
                  <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0"><Link href={lead ? `/team/leads/${lead.id}` : "#"} className="text-sm font-medium hover:underline">Visit: {c?.full_name ?? "Family"}</Link><p className="text-xs text-ink-soft">{formatDateTimeIST(v.scheduled_at)}{v.attendees ? ` · ${v.attendees}` : ""}</p></div>
                  </li>
                );
              })}
              {((followUps.data ?? []) as { id: string; follow_up_due_at: string; lead: unknown }[]).map((f) => {
                const lead = one(f.lead as { id: string; contact: Named | Named[] } | null);
                const c = one(lead?.contact);
                const late = Date.parse(f.follow_up_due_at) < Date.now();
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0"><Link href={lead ? `/team/leads/${lead.id}` : "#"} className="text-sm font-medium hover:underline">Follow-up call: {c?.full_name ?? "Lead"}</Link><p className={`text-xs ${late ? "text-burgundy-700" : "text-ink-soft"}`}>{late ? "Overdue: was due " : "Due "}{relativeFromNow(f.follow_up_due_at)}</p></div>
                    {c?.phone_e164 ? <a href={`tel:${c.phone_e164}`} className="shrink-0 rounded-full bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-800">Call</a> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {seesWeddings ? (
          <Card>
            <CardHeader title="Next weddings" subtitle="The next 90 days" action={<Link href="/team/weddings" className="text-sm text-sage-700 underline">All weddings</Link>} />
            <ul className="divide-y divide-line/70">
              {next90.length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No weddings in the next 90 days.</li> : null}
              {next90.slice(0, 6).map((w) => (
                <li key={w.id}><Link href={`/team/weddings/${w.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-ivory-50 sm:px-5"><span className="text-sm font-medium">{w.title}</span><span className="shrink-0 text-xs text-ink-soft">{formatDateIST(w.event_start, { day: "numeric", month: "short" })} · {relativeFromNow(`${w.event_start}T06:00:00+05:30`)}</span></Link></li>
              ))}
            </ul>
          </Card>
        ) : null}

        {spend ? (() => {
          const used = spend.budgetUsd ? Math.round((spend.monthUsd / spend.budgetUsd) * 100) : 0;
          const warn = used >= spend.warnAtPct;
          const inr = (usd: number) => `₹${Math.round(usd * spend.inrPerUsd).toLocaleString("en-IN")}`;
          return (
            <Card>
              <CardHeader title="AI credits" subtitle={spend.live ? "Moodboard pictures, voiceovers, music and clips (fal)" : "fal isn't connected yet: nothing is being spent"} action={<a href="https://fal.ai/dashboard/billing" target="_blank" rel="noreferrer" className="text-sm text-sage-700 underline">Top up</a>} />
              <div className="space-y-2 px-4 pb-4 text-sm sm:px-5">
                {spend.balanceUsd !== null ? <p><span className="font-serif text-2xl font-semibold">${spend.balanceUsd.toFixed(2)}</span> <span className="text-ink-soft">left in the fal account ({inr(spend.balanceUsd)})</span></p> : null}
                <p>This month: <strong>${spend.monthUsd.toFixed(2)}</strong> of ${spend.budgetUsd} ({inr(spend.monthUsd)})</p>
                <div className="h-2.5 rounded-full bg-ivory-100" title={`${used}% of the monthly budget`}><div className={`h-2.5 rounded-full ${warn ? "bg-burgundy-600" : "bg-sage-600"}`} style={{ width: `${Math.min(100, used)}%` }} /></div>
                <p className="text-xs text-ink-soft">Moodboards ${spend.moodboardsUsd.toFixed(2)} · Content ${spend.contentUsd.toFixed(2)}{warn ? " · over the warning line" : ""}</p>
              </div>
            </Card>
          );
        })() : null}

        {attention.length || guestCount ? (
          <Card>
            <CardHeader title="Needs attention" subtitle="Guest requests, questions agents couldn't answer, and alerts" />
            <ul className="divide-y divide-line/70">
              {guestCount ? <li className="px-4 py-3 text-sm sm:px-5"><Link href="/team/weddings" className="font-medium hover:underline">{guestCount} new guest request{guestCount === 1 ? "" : "s"}</Link><p className="text-xs text-ink-soft">Confirm them in each wedding&rsquo;s Extras tab.</p></li> : null}
              {attention.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0"><p className="text-sm font-medium">{a.link ? <Link href={a.link} className="hover:underline">{a.title}</Link> : a.title}</p><p className="line-clamp-2 text-xs text-ink-soft">{a.body ? `${a.body} · ` : ""}{relativeFromNow(a.at)}</p></div>
                  {a.note ? <ActionButton action={markNotificationRead.bind(null, a.note)} variant="ghost" pendingLabel="…">Done</ActionButton> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
