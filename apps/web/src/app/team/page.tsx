import { Badge, Card, CardHeader, EmptyState, PageTitle, Stat } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, todayIST, addDays, type BriefRow } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { ScoreBadge, SOURCE_LABELS } from "@/components/lead-badges";
import { Markdown } from "@/components/markdown";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aiSpend } from "@/lib/media/spend";
import { generateBriefNow, markNotificationRead } from "./actions";

export const metadata = { title: "Today" };

type Named = { full_name: string } | null;

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const viewer = await requireStaff();
  const { denied } = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const isOwner = viewer.profile.role === "owner";
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const role = viewer.profile.role;
  const seesSales = ["owner", "sales"].includes(role);
  const seesGuests = ["owner", "event_manager"].includes(role);
  const seesSpend = ["owner", "accounts"].includes(role);
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const [brief, newLeads, approvals, visits, myTasks, queue, toSend, followUps, guestAsks, notes, spend] = await Promise.all([
    supabase.from("briefs").select("*").eq("kind", "morning").is("recipient_id", null).order("for_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("leads").select("id, source, score, hot, date_wanted, guest_count, created_at, contact:contacts(full_name)").gte("last_touch_at", since).order("score", { ascending: false, nullsFirst: false }).limit(6),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("visits").select("id, scheduled_at, attendees, lead:leads(id, contact:contacts(full_name))").eq("status", "scheduled").gte("scheduled_at", `${today}T00:00:00+05:30`).lt("scheduled_at", `${addDays(today, 2)}T00:00:00+05:30`).order("scheduled_at"),
    supabase.from("tasks").select("id, title, due_at, priority, status, wedding:weddings(title)").eq("owner_id", viewer.userId).in("status", ["todo", "in_progress", "blocked"]).order("due_at").limit(8),
    supabase.from("human_queue").select("id, title, detail, reason, created_at, lead_id").neq("status", "done").order("created_at", { ascending: false }).limit(6),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("status", "approved").eq("direction", "outbound").in("channel", ["whatsapp", "email"]),
    // The one follow-up call after a visit (policy), due in the next two days or overdue.
    seesSales ? supabase.from("visits").select("id, follow_up_due_at, lead:leads(id, status, contact:contacts(full_name, phone_e164))").eq("follow_up_outcome", "pending").not("follow_up_due_at", "is", null).lte("follow_up_due_at", soon).order("follow_up_due_at").limit(8) : Promise.resolve({ data: [] }),
    seesGuests ? supabase.from("guest_requests").select("id, option_name, guest_name, room, quantity, wanted_on, created_at, wedding:weddings(id, title)").eq("status", "new").order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] }),
    supabase.from("notifications").select("id, title, body, link, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(8),
    seesSpend ? aiSpend().catch(() => null) : Promise.resolve(null),
  ]);

  const b = brief.data as BriefRow | null;
  const overdue = (myTasks.data ?? []).filter((t) => t.due_at && Date.parse(t.due_at) < Date.now()).length;
  const hello = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date());
  const greeting = Number(hello) < 12 ? "Good morning" : Number(hello) < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      {denied ? <p className="mb-4 rounded-xl bg-burgundy-50 px-4 py-2 text-sm text-burgundy-700">{denied === "1" ? "That page is for another role." : `You don’t have access to ${denied}. Ask Prashanth if you need it.`}</p> : null}
      <PageTitle title={`${greeting}, ${viewer.profile.full_name.split(" ")[0]}`} subtitle={formatDateIST(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />

      {isOwner ? <p className="mb-3 text-sm"><Link href="/team/owner" className="text-sage-700 underline">Your five numbers, bookings and profit →</Link></p> : null}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Stat label="New enquiries (24 h)" value={(newLeads.data ?? []).length} hint={<Link href="/team/leads" className="underline">Lead inbox</Link>} />
        <Stat label="Waiting for approval" value={approvals.count ?? 0} tone={(approvals.count ?? 0) > 0 ? "burgundy" : "sage"} hint={<Link href="/team/approvals" className="underline">Approval queue</Link>} />
        <Stat label="Approved, ready to send" value={toSend.count ?? 0} tone={(toSend.count ?? 0) > 0 ? "gold" : "sage"} hint={<Link href="/team/outbox" className="underline">To send</Link>} />
        <Stat label="Visits today & tomorrow" value={(visits.data ?? []).length} tone="gold" />
        <Stat label="My overdue tasks" value={overdue} tone={overdue ? "burgundy" : "sage"} />
        {seesSales ? <Stat label="Follow-up calls due" value={(followUps.data ?? []).length} tone={(followUps.data ?? []).length ? "gold" : "sage"} hint="One call, two days after a visit" /> : null}
        {seesGuests ? <Stat label="New guest requests" value={(guestAsks.data ?? []).length} tone={(guestAsks.data ?? []).length ? "gold" : "sage"} /> : null}
      </div>

      <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title={b ? b.title : "Morning brief"}
            subtitle={b ? (b.for_date === today ? "Written by the Chief of Staff at 8:30 am" : `Last brief: ${formatDateIST(b.for_date)}`) : "The Chief of Staff writes this every day at 8:30 am"}
            action={isOwner ? <ActionButton action={generateBriefNow} pendingLabel="Writing…">{b?.for_date === today ? "Refresh" : "Write now"}</ActionButton> : null}
          />
          <div className="px-4 py-4 sm:px-5">
            {b ? <Markdown source={b.content_md} /> : <EmptyState title="No brief yet">{isOwner ? "Press “Write now” to generate today's brief from live data." : "Prashanth's brief appears here once written."}</EmptyState>}
          </div>
        </Card>

        <div className="space-y-5">
          {(notes.data ?? []).length ? (
            <Card>
              <CardHeader title="For you" subtitle="Alerts from guests, agents and the team" />
              <ul className="divide-y divide-line/70">
                {(notes.data ?? []).map((n) => (
                  <li key={n.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.link ? <Link href={n.link as string} className="hover:underline">{n.title as string}</Link> : (n.title as string)}</p>
                      <p className="text-xs text-ink-soft">{n.body ? `${n.body as string} · ` : ""}{relativeFromNow(n.created_at as string)}</p>
                    </div>
                    <ActionButton action={markNotificationRead.bind(null, n.id as string)} variant="ghost" pendingLabel="…">Done</ActionButton>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {seesSales ? (
            <Card>
              <CardHeader title="Follow-up calls" subtitle="Exactly one, two days after the visit; if there's no answer, we stop" />
              <ul className="divide-y divide-line/70">
                {(followUps.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">None due.</li> : null}
                {(followUps.data ?? []).map((f) => {
                  const lead = (Array.isArray(f.lead) ? f.lead[0] : f.lead) as { id: string; contact: { full_name: string; phone_e164: string | null } | { full_name: string; phone_e164: string | null }[] | null } | null;
                  const c = Array.isArray(lead?.contact) ? lead?.contact[0] : lead?.contact;
                  const late = Date.parse(f.follow_up_due_at as string) < Date.now();
                  return (
                    <li key={f.id as string} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <Link href={lead ? `/team/leads/${lead.id}` : "#"} className="text-sm font-medium hover:underline">{c?.full_name ?? "Lead"}</Link>
                        <p className={`text-xs ${late ? "text-burgundy-700" : "text-ink-soft"}`}>{late ? "Overdue: was due " : "Due "}{relativeFromNow(f.follow_up_due_at as string)}</p>
                      </div>
                      {c?.phone_e164 ? <a href={`tel:${c.phone_e164}`} className="shrink-0 rounded-full bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-800">Call</a> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {seesGuests && (guestAsks.data ?? []).length ? (
            <Card>
              <CardHeader title="Guest requests" subtitle="From the guests' page; confirm them in the wedding's Extras tab" />
              <ul className="divide-y divide-line/70">
                {(guestAsks.data ?? []).map((g) => {
                  const w = (Array.isArray(g.wedding) ? g.wedding[0] : g.wedding) as { id: string; title: string } | null;
                  return (
                    <li key={g.id as string} className="px-4 py-3 sm:px-5">
                      <Link href={w ? `/team/weddings/${w.id}?tab=extras` : "#"} className="text-sm font-medium hover:underline">{g.option_name as string}{Number(g.quantity) > 1 ? ` × ${g.quantity as number}` : ""}</Link>
                      <p className="text-xs text-ink-soft">{[g.guest_name, g.room ? `room ${g.room as string}` : null, w?.title, g.wanted_on ? formatDateIST(g.wanted_on as string, { day: "numeric", month: "short" }) : null].filter(Boolean).join(" · ")}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {spend ? (() => {
            const pct = spend.budgetUsd ? Math.round((spend.monthUsd / spend.budgetUsd) * 100) : 0;
            const warn = pct >= spend.warnAtPct;
            const inr = (usd: number) => `₹${Math.round(usd * spend.inrPerUsd).toLocaleString("en-IN")}`;
            return (
              <Card>
                <CardHeader title="AI credits" subtitle={spend.live ? "Moodboard pictures, voiceovers, music and clips (fal)" : "fal isn't connected yet: nothing is being spent"} action={<a href="https://fal.ai/dashboard/billing" target="_blank" rel="noreferrer" className="text-sm text-sage-700 underline">Top up</a>} />
                <div className="space-y-2 px-4 pb-4 text-sm sm:px-5">
                  {spend.balanceUsd !== null ? <p><span className="font-serif text-2xl font-semibold">${spend.balanceUsd.toFixed(2)}</span> <span className="text-ink-soft">left in the fal account ({inr(spend.balanceUsd)})</span></p> : spend.live ? <p className="text-xs text-ink-soft">To see the live balance here, use a fal key with billing read access.</p> : null}
                  <p>This month: <strong>${spend.monthUsd.toFixed(2)}</strong> of ${spend.budgetUsd} budget ({inr(spend.monthUsd)})</p>
                  <div className="h-2 rounded-full bg-ivory-100"><div className={`h-2 rounded-full ${warn ? "bg-burgundy-600" : "bg-sage-600"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  <p className="text-xs text-ink-soft">Moodboards ${spend.moodboardsUsd.toFixed(2)} · Content ${spend.contentUsd.toFixed(2)} · {spend.jobs} AI job{spend.jobs === 1 ? "" : "s"}{warn ? " · over the warning line" : ""}. Each wedding&rsquo;s moodboard spend is in its costs; content is marketing spend.</p>
                </div>
              </Card>
            );
          })() : null}

          <Card>
            <CardHeader title="Needs a person" subtitle="Escalations and work from paused agents" />
            <ul className="divide-y divide-line/70">
              {(queue.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing waiting.</li> : null}
              {(queue.data ?? []).map((q) => (
                <li key={q.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{q.lead_id ? <Link href={`/team/leads/${q.lead_id}`} className="hover:underline">{q.title}</Link> : q.title}</p>
                    <Badge tone={q.reason === "agent_disabled" ? "gold" : "burgundy"}>{q.reason.replace(/_/g, " ")}</Badge>
                  </div>
                  {q.detail ? <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{q.detail}</p> : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Site visits" subtitle="Today and tomorrow" />
            <ul className="divide-y divide-line/70">
              {(visits.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No visits scheduled.</li> : null}
              {(visits.data ?? []).map((v) => {
                const lead = (Array.isArray(v.lead) ? v.lead[0] : v.lead) as { id: string; contact: Named | Named[] } | null;
                const c = Array.isArray(lead?.contact) ? lead?.contact[0] : lead?.contact;
                return (
                  <li key={v.id} className="px-4 py-3 sm:px-5">
                    <Link href={lead ? `/team/leads/${lead.id}` : "#"} className="text-sm font-medium hover:underline">{c?.full_name ?? "Visit"}</Link>
                    <p className="text-xs text-ink-soft">{formatDateTimeIST(v.scheduled_at)}{v.attendees ? ` · ${v.attendees}` : ""}</p>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="My tasks" />
            <ul className="divide-y divide-line/70">
              {(myTasks.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">You're all caught up.</li> : null}
              {(myTasks.data ?? []).map((t) => {
                const late = t.due_at && Date.parse(t.due_at) < Date.now();
                const w = (Array.isArray(t.wedding) ? t.wedding[0] : t.wedding) as { title: string } | null;
                return (
                  <li key={t.id} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm">{t.title}</p>
                      <p className="text-xs text-ink-soft">{w ? `${w.title} · ` : ""}{t.due_at ? `due ${relativeFromNow(t.due_at)}` : "no due date"}</p>
                    </div>
                    {late ? <Badge tone="burgundy">Overdue</Badge> : t.priority === "urgent" || t.priority === "high" ? <Badge tone="gold">{t.priority}</Badge> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Latest enquiries" action={<Link href="/team/leads" className="text-sm text-sage-700 hover:underline">All leads →</Link>} />
        <ul className="divide-y divide-line/70">
          {(newLeads.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No enquiries in the last 24 hours.</li> : null}
          {(newLeads.data ?? []).map((l) => {
            const c = (Array.isArray(l.contact) ? l.contact[0] : l.contact) as Named;
            return (
              <li key={l.id}>
                <Link href={`/team/leads/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c?.full_name ?? "Unknown"}</p>
                    <p className="text-xs text-ink-soft">{SOURCE_LABELS[l.source] ?? l.source}{l.date_wanted ? ` · ${formatDateIST(l.date_wanted)}` : ""}{l.guest_count ? ` · ${l.guest_count} guests` : ""}</p>
                  </div>
                  <ScoreBadge score={l.score} hot={l.hot} />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
