import { Card, CardHeader, buttonClass } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, rupees, type LeadStatus } from "@wiwaha/db";
import { PolicyBook, type PolicyRow } from "@wiwaha/policy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { ScoreBadge, SOURCE_LABELS } from "@/components/lead-badges";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { releaseEntry } from "../actions";
import { HeardAboutSelect, HoldForm, StageButtons } from "./lead-controls";
import { googleCalendarLink } from "@/lib/calendar-links";
import { env } from "@/lib/env";
import { BookVisit, VisitCard, type SlotOption } from "./visit-panel";
import { BookedForm } from "./booked-form";
import { standardSplit } from "@/lib/standard-split";
import { findSlots, formatSlot, istDate, SupabaseDb } from "@wiwaha/agents";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Lead" };


export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const viewer = await requireStaff(["owner", "sales", "event_manager"]);
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();
  const standard = await standardSplit(supabase);

  const { data: lead } = await supabase.from("leads").select("*, contact:contacts(*)").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [touches, visits, holds, spaces, policies] = await Promise.all([
    supabase.from("lead_touches").select("*").eq("lead_id", id).order("received_at", { ascending: false }),
    supabase.from("visits").select("*").eq("lead_id", id).order("scheduled_at", { ascending: false }),
    supabase.from("calendar_entries").select("id, status, starts_on, ends_on, expires_at, label, space:spaces(name)").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("spaces").select("id, name, capacity_seated").eq("active", true).order("sort"),
    supabase.from("policies").select("key, topic, title, rule_text, value, version, client_visible, needs_confirmation, sort"),
  ]);
  const book = PolicyBook.fromRows((policies.data ?? []) as PolicyRow[]);
  const [{ data: calls }, { data: people }, { data: sourceRows }] = await Promise.all([
    supabase.from("calls").select("id, direction, purpose, handled_by, started_at, duration_seconds, summary, transcript, outcome, recording_url, status, language").eq("lead_id", id).order("started_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, role").in("role", ["sales", "owner", "event_manager"]).eq("active", true),
    supabase.from("lead_sources").select("label").eq("active", true).order("sort"),
  ]);
  const nameOf = (pid: string | null) => (people ?? []).find((p) => p.id === pid)?.full_name ?? null;
  let slots: SlotOption[] = [];
  if ((viewer.profile.role === "owner" || viewer.profile.role === "sales") && book.has("visits.booking")) {
    const now = new Date();
    const free = await findSlots(new SupabaseDb(createAdminClient("system")), book, now, istDate(now), 7, 12).catch(() => []);
    slots = free.map((s) => ({ startsAt: s.startsAt, executiveId: s.executiveId, label: formatSlot(s.startsAt), executive: nameOf(s.executiveId) ?? "Sales" }));
  }
  const checklist = book.has("visits.checklist") ? book.get("visits.checklist").items : [];
  const canEdit = viewer.profile.role === "owner" || viewer.profile.role === "sales";
  const contact = lead.contact as { full_name: string; phone_e164: string | null; email: string | null; city: string | null; consent_whatsapp: boolean; consent_email: boolean };
  // The journey (D44): enquiry, each visit, then booked or lost.
  type Step = { key: string; title: string; when: string | null; note: string | null; tone: "done" | "next" | "lost" | "won" | "skip" };
  const visitList = [...(visits.data ?? [])].sort((x, y) => String(x.scheduled_at).localeCompare(String(y.scheduled_at)));
  const VISIT: Record<string, string> = { scheduled: "Booked", completed: "Done", no_show: "Didn't come", cancelled: "Cancelled", rescheduled: "Moved" };
  const heard = (lead.heard_about as string | null) ?? null;
  const journey: Step[] = [
    { key: "enquiry", title: "Enquiry", when: lead.first_touch_at as string, note: [heard ? `Heard via ${heard}` : null, SOURCE_LABELS[lead.source as string] ?? (lead.source as string), (touches.data ?? []).length > 1 ? `${(touches.data ?? []).length} enquiries` : null].filter(Boolean).join(" · "), tone: "done" },
    ...visitList.map((v) => ({ key: v.id as string, title: `Visit ${v.visit_number as number}`, when: v.scheduled_at as string, note: [VISIT[v.status as string] ?? String(v.status), v.attendees as string | null].filter(Boolean).join(" · "), tone: (v.status === "scheduled" ? "next" : v.status === "completed" ? "done" : "skip") as Step["tone"] })),
    lead.status === "won" ? { key: "won", title: "Booked", when: null, note: lead.wedding_id ? "Wedding Room created" : null, tone: "won" }
      : ["lost", "no_response"].includes(lead.status as string) ? { key: "lost", title: "Lost", when: null, note: (lead.lost_reason as string | null) ?? null, tone: "lost" }
      : { key: "open", title: visitList.length ? "Decision" : "Site visit", when: null, note: visitList.length ? "Waiting for the family" : "Not booked yet", tone: "next" },
  ];
  const heardOptions = (sourceRows ?? []).map((r) => r.label as string);

  return (
    <>
      <Link href="/team/leads" className="text-sm text-sage-700 hover:underline">← Leads</Link>
      {created ? <p className="mt-3 rounded-xl bg-sage-50 px-4 py-2 text-sm text-sage-800 ring-1 ring-sage-200">Lead saved.</p> : null}
      <div className="mb-5 mt-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{contact.full_name}</h1>
            <p className="mt-1 text-sm text-ink-soft">{[lead.date_wanted ? formatDateIST(lead.date_wanted as string, { day: "numeric", month: "short", year: "numeric" }) + (lead.date_flexible ? " (flexible)" : "") : "No date yet", lead.guest_count ? `${lead.guest_count as number} guests` : null, String(lead.event_type).replace(/_/g, " "), heard ? `heard via ${heard}` : null].filter(Boolean).join(" · ")} <ScoreBadge score={lead.score as number | null} hot={lead.hot as boolean} /></p>
          </div>
          {contact.phone_e164 ? (
            <p className="flex flex-wrap gap-2">
              <a href={`tel:${contact.phone_e164}`} className={buttonClass("secondary", "sm")}>Call</a>
              <a href={`https://wa.me/${contact.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>WhatsApp</a>
            </p>
          ) : null}
        </div>
        {canEdit ? <StageButtons leadId={id} status={lead.status as LeadStatus} lostReason={(lead.lost_reason as string | null) ?? null} booked={!!lead.wedding_id} /> : null}
      </div>

      <Card className="mb-5 p-4 sm:p-5">
        <h2 className="sr-only">Journey</h2>
        <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
          {journey.map((st, i) => (
            <li key={st.key} className="relative flex gap-3 sm:flex-1 sm:flex-col sm:gap-2">
              {i < journey.length - 1 ? <span aria-hidden className="absolute left-[9px] top-6 h-[calc(100%-4px)] w-0.5 bg-line sm:left-6 sm:top-[9px] sm:h-0.5 sm:w-[calc(100%-24px)]" /> : null}
              <span aria-hidden className={`relative z-10 mt-0.5 size-5 shrink-0 rounded-full ring-4 ring-white ${st.tone === "done" ? "bg-sage-600" : st.tone === "won" ? "bg-gold-500" : st.tone === "lost" ? "bg-ink" : st.tone === "skip" ? "bg-ivory-300" : "border-2 border-sage-600 bg-white"}`} />
              <div className="min-w-0 sm:pr-3">
                <p className="text-sm font-medium">{st.title}</p>
                {st.when ? <p className="text-xs text-ink-soft">{formatDateTimeIST(st.when)}</p> : null}
                {st.note ? <p className="text-xs text-ink-soft">{st.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1fr_340px]">
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
            <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2 sm:px-5">
              <div className="text-sm">
                <p className="text-xs text-ink-soft">Contact</p>
                <p>{contact.phone_e164 ? <a href={`tel:${contact.phone_e164}`} className="text-sage-700 underline">{contact.phone_e164}</a> : "No phone"}</p>
                <p>{contact.email ? <a href={`mailto:${contact.email}`} className="text-sage-700 underline">{contact.email}</a> : "No email"}</p>
              </div>
              {canEdit ? <HeardAboutSelect leadId={id} value={heard} options={heardOptions} /> : <p className="text-sm"><span className="text-xs text-ink-soft">Heard about us</span><br />{heard ?? "Not asked yet"}</p>}
            </div>
          </Card>

          {(calls ?? []).length ? (
            <Card>
              <CardHeader title="Calls" />
              <ul className="divide-y divide-line">
                {(calls ?? []).map((c) => (
                  <li key={c.id as string} className="px-4 py-3 text-sm sm:px-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium capitalize">{c.direction} {String(c.purpose ?? "call").replace(/_/g, " ")} · {String(c.outcome ?? c.status).replace(/_/g, " ")}</p>
                      <time className="text-xs text-ink-soft">{formatDateTimeIST(c.started_at as string)}{c.duration_seconds ? ` · ${Math.round((c.duration_seconds as number) / 60)} min` : ""}</time>
                    </div>
                    {c.summary ? <p className="mt-1 text-ink-soft">{c.summary as string}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {canEdit ? (
            <Card className="scroll-mt-20 p-4 sm:p-5" id="booking">
              <h2 className="font-serif text-xl font-semibold">Book the wedding</h2>
              {!lead.wedding_id ? <p className="mt-1 text-sm text-ink-soft">Once the family says yes: creates the Wedding Room, its checklist and payment parts, and their portal.</p> : null}
              {lead.wedding_id ? (
                <p className="mt-2 text-sm">Booked. <Link href={`/team/weddings/${lead.wedding_id as string}`} className="text-sage-700 underline">Open the Wedding Room →</Link></p>
              ) : (
                <div className="mt-3"><BookedForm standard={standard} canChangeSplit={viewer.profile.role === "owner"} leadId={id} defaultTitle={contact.full_name} defaultDate={lead.date_wanted as string | null} managers={(people ?? []).filter((p) => p.role === "event_manager" || p.role === "owner").map((p) => ({ id: p.id as string, name: p.full_name as string }))} /></div>
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
            {(visits.data ?? []).filter((v) => v.status === "scheduled" && Date.parse(v.scheduled_at as string) > Date.now()).map((v) => (
              <a key={`g${v.id as string}`} href={googleCalendarLink({ title: `Site visit: ${contact.full_name}`, start: v.scheduled_at as string, minutes: Number(v.duration_minutes ?? 60), details: [v.attendees ? `Coming: ${v.attendees as string}` : null, `Lead: ${env.appUrl()}/team/leads/${id}`].filter(Boolean).join("\n") })} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-sage-700 underline">Add visit #{v.visit_number as number} to Google Calendar</a>
            ))}
            {canEdit ? <div className="mt-4 border-t border-line pt-4"><BookVisit leadId={id} slots={slots} /></div> : null}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Dates</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(holds.data ?? []).length === 0 ? <li className="text-ink-soft">No dates booked for this family yet.</li> : null}
              {(holds.data ?? []).map((h) => {
                const live = h.status === "held" && h.expires_at && Date.parse(h.expires_at as string) > Date.now();
                const space = (Array.isArray(h.space) ? h.space[0] : h.space) as { name: string } | null;
                return (
                  <li key={h.id as string} className="flex items-start justify-between gap-2 rounded-xl bg-ivory-100 px-3 py-2">
                    <div>
                      <p className="font-medium">{space?.name ?? "Space"} · {formatDateIST(h.starts_on as string)}{h.ends_on !== h.starts_on ? ` – ${formatDateIST(h.ends_on as string)}` : ""}</p>
                      <p className="text-xs text-ink-soft">{h.status === "confirmed" ? "Booked" : live ? `Held · expires ${relativeFromNow(h.expires_at as string)}` : h.status === "held" ? "Expired (releasing)" : String(h.status)}</p>
                    </div>
                    {(live || h.status === "confirmed") && canEdit ? <ActionButton action={releaseEntry.bind(null, h.id as string, `/team/leads/${id}`)} variant="ghost" confirm="Release these dates?">Release</ActionButton> : null}
                  </li>
                );
              })}
            </ul>
            {["owner", "sales"].includes(viewer.profile.role) ? (
              <div className="mt-4 border-t border-line pt-4">
                <HoldForm leadId={id} label={contact.full_name} defaultDate={lead.date_wanted as string | null} spaces={(spaces.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, capacity: s.capacity_seated as number }))} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
