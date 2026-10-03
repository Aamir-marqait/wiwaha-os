import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, rupees, type LeadStatus } from "@wiwaha/db";
import { PolicyBook, type PolicyRow } from "@wiwaha/policy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { LeadStatusBadge, ScoreBadge, SOURCE_LABELS } from "@/components/lead-badges";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { releaseEntry, rerunLeadDesk } from "../actions";
import { HoldForm, StatusSelect } from "./lead-controls";
import { BookVisit, VisitCard, type SlotOption } from "./visit-panel";
import { BookedForm } from "./booked-form";
import { findSlots, formatSlot, istDate, SupabaseDb } from "@wiwaha/agents";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Lead" };

interface TimelineItem { at: string; kind: string; title: string; body?: string | null; tone: "sage" | "gold" | "burgundy" | "neutral"; href?: string }

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const viewer = await requireStaff(["owner", "sales", "event_manager"]);
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();

  const { data: lead } = await supabase.from("leads").select("*, contact:contacts(*)").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [touches, messages, actions, visits, holds, spaces, policies] = await Promise.all([
    supabase.from("lead_touches").select("*").eq("lead_id", id).order("received_at", { ascending: false }),
    supabase.from("messages").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("agent_actions").select("id, agent_key, action, status, created_at, output, approval_id").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("visits").select("*").eq("lead_id", id).order("scheduled_at", { ascending: false }),
    supabase.from("calendar_entries").select("id, status, starts_on, ends_on, expires_at, label, space:spaces(name)").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("spaces").select("id, name, capacity_seated").eq("active", true).order("sort"),
    supabase.from("policies").select("key, topic, title, rule_text, value, version, client_visible, needs_confirmation, sort"),
  ]);
  const book = PolicyBook.fromRows((policies.data ?? []) as PolicyRow[]);
  const [{ data: calls }, { data: people }] = await Promise.all([
    supabase.from("calls").select("id, direction, purpose, handled_by, started_at, duration_seconds, summary, transcript, outcome, recording_url, status, language").eq("lead_id", id).order("started_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, role").in("role", ["sales", "owner", "event_manager"]).eq("active", true),
  ]);
  const nameOf = (pid: string | null) => (people ?? []).find((p) => p.id === pid)?.full_name ?? null;
  let slots: SlotOption[] = [];
  if ((viewer.profile.role === "owner" || viewer.profile.role === "sales") && book.has("visits.booking")) {
    const now = new Date();
    const free = await findSlots(new SupabaseDb(createAdminClient("system")), book, now, istDate(now), 7, 12).catch(() => []);
    slots = free.map((s) => ({ startsAt: s.startsAt, executiveId: s.executiveId, label: formatSlot(s.startsAt), executive: nameOf(s.executiveId) ?? "Sales" }));
  }
  const checklist = book.has("visits.checklist") ? book.get("visits.checklist").items : [];
  const holdHours = book.has("holds.soft_hold") ? book.get("holds.soft_hold").hours : 72;
  const canEdit = viewer.profile.role === "owner" || viewer.profile.role === "sales";
  const contact = lead.contact as { full_name: string; phone_e164: string | null; email: string | null; city: string | null; consent_whatsapp: boolean; consent_email: boolean };
  const breakdown = lead.score_breakdown as { date_fit: number; guest_fit: number; budget: number; source: number; notes: string[] } | null;

  const timeline: TimelineItem[] = [
    ...(touches.data ?? []).map((t) => ({ at: t.received_at as string, kind: "Enquiry", title: `${SOURCE_LABELS[t.channel as string] ?? t.channel} ${t.direction === "inbound" ? "enquiry" : "message"}`, body: t.message as string | null, tone: "gold" as const })),
    ...(messages.data ?? []).map((m) => ({ at: m.created_at as string, kind: "Message", title: `${m.author_kind === "agent" ? "Lead Desk draft" : "Message"} · ${String(m.status).replace(/_/g, " ")}`, body: m.body as string, tone: (m.status === "pending_approval" ? "burgundy" : m.status === "rejected" ? "neutral" : "sage") as TimelineItem["tone"], href: m.approval_id ? "/team/approvals" : undefined })),
    ...(visits.data ?? []).map((v) => ({ at: v.scheduled_at as string, kind: "Visit", title: `Site visit #${v.visit_number} · ${v.status}`, body: [v.attendees, v.notes].filter(Boolean).join(" · "), tone: "sage" as const })),
    ...(actions.data ?? []).filter((a) => a.action === "score_lead").map((a) => ({ at: a.created_at as string, kind: "Agent", title: `Lead Desk scored ${(a.output as { score?: number }).score ?? "?"}`, tone: "neutral" as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <Link href="/team/leads" className="text-sm text-sage-700 hover:underline">← Lead inbox</Link>
      {created ? <p className="mt-3 rounded-xl bg-sage-50 px-4 py-2 text-sm text-sage-800 ring-1 ring-sage-200">Lead saved. Lead Desk is scoring it and drafting a reply for the approval queue.</p> : null}
      <div className="mb-5 mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{contact.full_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <LeadStatusBadge status={lead.status as LeadStatus} />
            <ScoreBadge score={lead.score as number | null} hot={lead.hot as boolean} />
            <span>{SOURCE_LABELS[lead.source as string] ?? lead.source}{lead.source_detail ? ` · ${lead.source_detail}` : ""}</span>
            {(lead.touch_count as number) > 1 ? <Badge tone="gold">{lead.touch_count} touches (de-duplicated)</Badge> : null}
          </div>
        </div>
        {canEdit ? <ActionButton action={rerunLeadDesk.bind(null, id)} pendingLabel="Lead Desk is working…">Re-run Lead Desk</ActionButton> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Enquiry" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
              <div><dt className="text-xs text-ink-soft">Date wanted</dt><dd>{lead.date_wanted ? formatDateIST(lead.date_wanted as string, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"}{lead.date_flexible ? " (flexible)" : ""}</dd></div>
              <div><dt className="text-xs text-ink-soft">Guests</dt><dd>{(lead.guest_count as number | null) ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-soft">Budget</dt><dd>{lead.budget_paise ? rupees(lead.budget_paise as number, { compact: true }) : (lead.budget_text as string | null) ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-soft">Event</dt><dd className="capitalize">{String(lead.event_type).replace(/_/g, " ")}</dd></div>
              <div><dt className="text-xs text-ink-soft">City</dt><dd>{(lead.city as string | null) ?? contact.city ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-soft">First enquiry</dt><dd>{formatDateIST(lead.first_touch_at as string)}</dd></div>
            </dl>
            {lead.message ? <p className="mx-4 mb-4 rounded-xl bg-ivory-100 px-4 py-3 text-sm italic text-ink sm:mx-5">“{lead.message as string}”</p> : null}
          </Card>

          {(calls ?? []).length ? (
            <Card>
              <CardHeader title="Calls" subtitle="Answered by the Voice Concierge or the team" />
              <ul className="divide-y divide-line">
                {(calls ?? []).map((c) => (
                  <li key={c.id as string} className="px-4 py-3 text-sm sm:px-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium capitalize">{c.direction} {String(c.purpose ?? "call").replace(/_/g, " ")} · {String(c.outcome ?? c.status).replace(/_/g, " ")}{c.language && c.language !== "en" ? ` · ${c.language}` : ""}</p>
                      <time className="text-xs text-ink-soft">{formatDateTimeIST(c.started_at as string)}{c.duration_seconds ? ` · ${Math.round((c.duration_seconds as number) / 60)} min` : ""}</time>
                    </div>
                    {c.summary ? <p className="mt-1 text-ink-soft">{c.summary as string}</p> : null}
                    {c.recording_url ? <audio controls preload="none" src={c.recording_url as string} className="mt-2 w-full" /> : null}
                    {c.transcript ? <details className="mt-1"><summary className="cursor-pointer text-xs text-sage-700">Transcript</summary><p className="mt-1 whitespace-pre-line text-xs">{c.transcript as string}</p></details> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Timeline" subtitle="Enquiries, drafts, visits and agent actions" />
            <ol className="space-y-0 px-4 py-2 sm:px-5">
              {timeline.length === 0 ? <li className="py-3 text-sm text-ink-soft">Nothing yet.</li> : null}
              {timeline.map((t, i) => (
                <li key={i} className="relative border-l-2 border-line py-3 pl-4">
                  <span className={`absolute -left-[7px] top-4 size-3 rounded-full ${t.tone === "burgundy" ? "bg-burgundy-500" : t.tone === "gold" ? "bg-gold-400" : t.tone === "sage" ? "bg-sage-500" : "bg-ivory-300"}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-sm font-medium">{t.href ? <Link href={t.href} className="hover:underline">{t.title}</Link> : t.title}</p>
                    <time className="text-xs text-ink-soft">{formatDateTimeIST(t.at)}</time>
                  </div>
                  {t.body ? <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{t.body}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Contact</h2>
            <p className="mt-2 text-sm">{contact.phone_e164 ? <a href={`tel:${contact.phone_e164}`} className="text-sage-700 underline">{contact.phone_e164}</a> : "No phone"}</p>
            <p className="text-sm">{contact.email ?? "No email"}</p>
            <p className="mt-2 text-xs text-ink-soft">WhatsApp {contact.consent_whatsapp ? "✓ consented" : "✗ no consent"} · Email {contact.consent_email ? "✓" : "✗"}</p>
            {canEdit ? <div className="mt-4"><StatusSelect leadId={id} status={lead.status as LeadStatus} /></div> : null}
          </Card>

          {breakdown ? (
            <Card className="p-4 sm:p-5">
              <h2 className="font-serif text-xl font-semibold">Why this score</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(["date_fit", "guest_fit", "budget", "source"] as const).map((k) => (
                  <li key={k}>
                    <div className="flex justify-between text-xs text-ink-soft"><span className="capitalize">{k.replace("_", " ")}</span><span>{Math.round(breakdown[k] * 100)}%</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-ivory-200"><div className="h-1.5 rounded-full bg-sage-500" style={{ width: `${Math.round(breakdown[k] * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
              {breakdown.notes.length ? <ul className="mt-3 list-disc pl-4 text-xs text-ink-soft">{breakdown.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
              <p className="mt-3 text-xs text-ink-soft">Weights come from the <Link href="/team/settings/policy" className="underline">policy book</Link>.</p>
            </Card>
          ) : null}

          {canEdit ? (
            <Card className="p-4 sm:p-5">
              <h2 className="font-serif text-xl font-semibold">Booking</h2>
              {lead.wedding_id ? (
                <p className="mt-2 text-sm">Booked. <Link href={`/team/weddings/${lead.wedding_id as string}`} className="text-sage-700 underline">Open the Wedding Room →</Link></p>
              ) : (
                <div className="mt-3"><BookedForm leadId={id} defaultTitle={contact.full_name} defaultDate={lead.date_wanted as string | null} managers={(people ?? []).filter((p) => p.role === "event_manager" || p.role === "owner").map((p) => ({ id: p.id as string, name: p.full_name as string }))} /></div>
              )}
            </Card>
          ) : null}

          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Site visits</h2>
            <ul className="mt-2 space-y-2">
              {(visits.data ?? []).length === 0 ? <li className="text-sm text-ink-soft">No visits yet.</li> : null}
              {(visits.data ?? []).map((v) => (
                <VisitCard key={v.id as string} leadId={id} checklist={checklist} v={{
                  id: v.id as string, label: `#${v.visit_number} · ${formatSlot(v.scheduled_at as string)}`, status: v.status as string,
                  executive: nameOf(v.executive_id as string | null), attendees: v.attendees as string | null, brief: v.pre_visit_brief as string | null, recap: (v as { recap?: string | null }).recap ?? null,
                  followUp: v.follow_up_outcome === "pending" ? (v.follow_up_due_at ? `due ${formatDateTimeIST(v.follow_up_due_at as string)}` : "after the visit") : String(v.follow_up_outcome).replace(/_/g, " "),
                }} />
              ))}
            </ul>
            {canEdit ? <div className="mt-4 border-t border-line pt-4"><BookVisit leadId={id} slots={slots} /></div> : null}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Date holds</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(holds.data ?? []).length === 0 ? <li className="text-ink-soft">No holds for this family.</li> : null}
              {(holds.data ?? []).map((h) => {
                const live = h.status === "held" && h.expires_at && Date.parse(h.expires_at as string) > Date.now();
                const space = (Array.isArray(h.space) ? h.space[0] : h.space) as { name: string } | null;
                return (
                  <li key={h.id as string} className="flex items-start justify-between gap-2 rounded-xl bg-ivory-100 px-3 py-2">
                    <div>
                      <p className="font-medium">{space?.name ?? "Space"} · {formatDateIST(h.starts_on as string)}{h.ends_on !== h.starts_on ? ` – ${formatDateIST(h.ends_on as string)}` : ""}</p>
                      <p className="text-xs text-ink-soft">{live ? `Held · expires ${relativeFromNow(h.expires_at as string)}` : h.status === "held" ? "Expired (releasing)" : String(h.status)}</p>
                    </div>
                    {live && canEdit ? <ActionButton action={releaseEntry.bind(null, h.id as string, `/team/leads/${id}`)} variant="ghost" confirm="Release this hold now?">Release</ActionButton> : null}
                  </li>
                );
              })}
            </ul>
            {viewer.profile.role !== "staff" ? (
              <div className="mt-4 border-t border-line pt-4">
                <HoldForm leadId={id} label={`${contact.full_name} (hold)`} defaultDate={lead.date_wanted as string | null} spaces={(spaces.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, capacity: s.capacity_seated as number }))} holdHours={holdHours} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
