import { Badge, Card, CardHeader, cn } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, rupees, todayIST, type StageStatus } from "@wiwaha/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { StageStatusBadge, UNLOCK_TEXT } from "@/components/stage-status";
import { openStageNow } from "./actions";
import { requireStaff } from "@/lib/auth";
import { EFFECT_LABELS, isEffect } from "@/lib/payment-parts";
import { createClient } from "@/lib/supabase/server";
import { OperationsPanels } from "./closeout";
import { FamilyForm, FunctionsEditor } from "./family-forms";
import { AiMoodboards } from "./ai-moodboards";
import { CostingCard } from "./costing";
import { DecorStockCard } from "./decor-stock";
import { startPortalPreview } from "@/app/team/clients/preview-actions";
import { googleCalendarLink } from "@/lib/calendar-links";
import { env } from "@/lib/env";
import { METHOD_LABELS } from "@/lib/finance/labels";
import { GuestPanel } from "./guest-panel";
import { Lifecycle } from "./lifecycle";
import { PaymentForm } from "./panel-forms";
import { PlanningPanels } from "./panels";
import { WeddingPartsForm } from "./parts-form";
import { GroupCard, IdeasPanel, SelectionsPanel } from "./vertical-panels";

export const metadata = { title: "Wedding Room" };

/** One wedding, by department: the same headings the team works in. */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "decor", label: "Décor" },
  { key: "entertainment", label: "Entertainment" },
  { key: "fnb", label: "Food & beverage" },
  { key: "venue", label: "Venue & rooms" },
  { key: "extras", label: "Extras" },
  { key: "vendors", label: "Vendors" },
  { key: "payments", label: "Payments" },
  { key: "family", label: "Family" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function WeddingRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ existing?: string; note?: string; tab?: string }> }) {
  const viewer = await requireStaff(["owner", "sales", "event_manager", "accounts", "staff"]);
  const { id } = await params;
  const { existing, note, tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : "overview";
  const role = viewer.profile.role;
  const supabase = await createClient();
  const { data: w } = await supabase.from("weddings").select("*, manager:profiles!weddings_event_manager_id_fkey(full_name)").eq("id", id).maybeSingle();
  if (!w) notFound();
  const canEdit = ["owner", "sales", "event_manager"].includes(role);
  const canVertical = role === "owner" || (role === "event_manager" && w.event_manager_id === viewer.userId);
  const m = (Array.isArray(w.manager) ? w.manager[0] : w.manager) as { full_name: string } | null;
  const eventEnded = (w.event_end as string) < todayIST();

  return (
    <>
      <Link href="/team/weddings" className="text-sm text-sage-700 hover:underline">← Weddings</Link>
      {existing ? <p className="mt-3 rounded-xl bg-gold-100 px-4 py-2 text-sm text-gold-700">This family was already booked (same phone number), so you&rsquo;re looking at their existing Wedding Room instead of a duplicate.</p> : null}
      {note ? <p className="mt-3 rounded-xl bg-burgundy-50 px-4 py-2 text-sm text-burgundy-700">{note}</p> : null}
      <div className="mb-4 mt-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">Wedding Room · {w.code as string}</p>
        <h1 className="font-serif text-4xl font-semibold">{w.title as string}</h1>
        <p className="mt-1 text-sm text-ink-soft">{formatDateIST(w.event_start as string, { weekday: "short", day: "numeric", month: "long", year: "numeric" })} – {formatDateIST(w.event_end as string)} · {(w.guest_count as number | null) ?? "?"} guests · {(w.complimentary_rooms as number)} complimentary rooms · Event manager: {m?.full_name ?? "unassigned"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {["owner", "sales", "event_manager"].includes(role) ? <ActionButton action={startPortalPreview.bind(null, id)} pendingLabel="Opening…">See the portal as the couple</ActionButton> : null}
          <a href={googleCalendarLink({ title: `${w.title as string} (Wiwaha)`, start: w.event_start as string, end: w.event_end as string, allDay: true, details: `Wedding Room: ${env.appUrl()}/team/weddings/${id}` })} target="_blank" rel="noreferrer" className="text-sm text-sage-700 underline">Add to Google Calendar</a>
        </div>
      </div>

      <nav aria-label="Wedding sections" className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-1.5">
          {TABS.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link href={`/team/weddings/${id}${t.key === "overview" ? "" : `?tab=${t.key}`}`} aria-current={t.key === tab ? "page" : undefined}
                className={cn("block rounded-full px-3 py-1.5 text-sm", t.key === tab ? "bg-sage-700 font-medium text-white" : "bg-ivory-200 text-ink hover:bg-ivory-100")}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? <Overview supabase={supabase} w={w} id={id} role={role} canEdit={canEdit} /> : null}
      {tab === "decor" ? (
        <div className="space-y-5">
          <AiMoodboards supabase={supabase} weddingId={id} canEdit={role === "owner" || (role === "event_manager" && w.event_manager_id === viewer.userId)} />
          <PlanningPanels supabase={supabase} weddingId={id} role={role} show={["decor"]} />
          <DecorStockCard supabase={supabase} weddingId={id} showMoney={["owner", "accounts", "event_manager"].includes(role)} canEdit={["owner", "event_manager", "staff", "accounts"].includes(role)} />
          <p className="text-sm text-ink-soft">AI moodboards dress the plain photos in <Link href="/team/decor/areas" className="text-sage-700 underline">venue areas</Link>, guided by the <Link href="/team/decor/templates" className="text-sage-700 underline">décor templates by area</Link>.</p>
        </div>
      ) : null}
      {tab === "entertainment" ? <SelectionsPanel supabase={supabase} weddingId={id} vertical="entertainment" canEdit={canVertical} /> : null}
      {tab === "extras" ? (
        <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
          <SelectionsPanel supabase={supabase} weddingId={id} vertical="extras" canEdit={canVertical} />
          <GuestPanel supabase={supabase} w={{ id, title: w.title as string, guest_token: w.guest_token as string, guest_welcome: (w.guest_welcome as string | null) ?? null }} canEdit={canEdit} />
        </div>
      ) : null}
      {tab === "fnb" ? <div className="space-y-5"><PlanningPanels supabase={supabase} weddingId={id} role={role} show={["menus"]} /></div> : null}
      {tab === "venue" ? <div className="space-y-5"><OperationsPanels supabase={supabase} weddingId={id} role={role} eventEnded={eventEnded} show={["rooms", "run_of_show", "inspection"]} /></div> : null}
      {tab === "vendors" ? <div className="space-y-5"><PlanningPanels supabase={supabase} weddingId={id} role={role} show={["vendors"]} /></div> : null}
      {tab === "payments" ? <Payments supabase={supabase} w={w} id={id} role={role} eventEnded={eventEnded} /> : null}
      {tab === "family" ? <Family supabase={supabase} id={id} canEdit={canEdit} /> : null}
    </>
  );
}

type Supa = Awaited<ReturnType<typeof createClient>>;
type WeddingRow = Record<string, unknown> & { id: string };

async function Overview({ supabase, w, id, role, canEdit }: { supabase: Supa; w: WeddingRow; id: string; role: string; canEdit: boolean }) {
  const [stages, functions, messages, tasks, spaces] = await Promise.all([
    supabase.from("wedding_stages").select("*").eq("wedding_id", id).order("sort"),
    supabase.from("event_functions").select("*, space:spaces(name)").eq("wedding_id", id).order("date").order("start_time"),
    supabase.from("messages").select("*").eq("wedding_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("tasks").select("id, title, due_at, status, priority, owner:profiles!tasks_owner_id_fkey(full_name)").eq("wedding_id", id).order("due_at"),
    supabase.from("spaces").select("id, name").eq("active", true).order("sort"),
  ]);
  return (
    <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Lifecycle supabase={supabase} w={{ id, lead_id: (w.lead_id as string | null) ?? null, event_start: w.event_start as string, event_end: w.event_end as string, whatsapp_group_url: (w.whatsapp_group_url as string | null) ?? null }} />
        <Card>
          <CardHeader title="Planning stages" subtitle="What the couple sees in their portal. Each opens on its date, never before its payment." />
          <ul className="divide-y divide-line/70">
            {(stages.data ?? []).map((s) => (
              <li key={s.id as string} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.name as string}</p>
                  <p className="text-xs text-ink-soft">Opens {s.recommended_start ? formatDateIST(s.recommended_start as string) : "on booking"} · {UNLOCK_TEXT[s.unlock_rule as string] ?? (s.unlock_rule as string)}{s.started_at ? ` · started ${formatDateIST(s.started_at as string)}` : ""}</p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StageStatusBadge status={s.status as StageStatus} />
                  {s.status === "not_started" && (role === "owner" || role === "event_manager") ? <ActionButton action={openStageNow.bind(null, id, s.id as string)} variant="ghost" confirm={`Open "${s.name as string}" now for the family?`}>Open now</ActionButton> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Functions" subtitle="Added here or by the couple in their brief" />
          <FunctionsEditor weddingId={id} canEdit={canEdit} defaultDate={w.event_start as string} spaces={(spaces.data ?? []).map((sp) => ({ id: sp.id as string, name: sp.name as string }))}
            rows={(functions.data ?? []).map((f) => {
              const sp = (Array.isArray(f.space) ? f.space[0] : f.space) as { name: string } | null;
              return { id: f.id as string, type: f.type as string, name: f.name as string, date: f.date as string, start: f.start_time ? String(f.start_time).slice(0, 5) : "", end: f.end_time ? String(f.end_time).slice(0, 5) : "", guests: f.guest_count ? String(f.guest_count) : "", spaceId: (f.space_id as string | null) ?? "", rituals: (f.rituals as string | null) ?? "", spaceName: sp?.name ?? null };
            })} />
        </Card>
        <PlanningPanels supabase={supabase} weddingId={id} role={role} show={["contract", "brief", "decisions"]} />
        <Card>
          <CardHeader title="Room timeline" subtitle="Every message in this Wedding Room" />
          <ul className="divide-y divide-line/70">
            {(messages.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No messages yet.</li> : null}
            {(messages.data ?? []).map((msg) => (
              <li key={msg.id as string} className="px-4 py-3 sm:px-5">
                <p className="text-xs text-ink-soft">{String(msg.author_kind)} · {String(msg.channel)} · {formatDateTimeIST(msg.created_at as string)}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{msg.body as string}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="space-y-5">
        <GroupCard weddingId={id} url={(w.whatsapp_group_url as string | null) ?? null} canEdit={canEdit} />
        <IdeasPanel supabase={supabase} weddingId={id} eventStart={w.event_start as string} canNote={canEdit} />
        <Card>
          <CardHeader title="Tasks" />
          <ul className="divide-y divide-line/70">
            {(tasks.data ?? []).length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">No tasks yet.</li> : null}
            {(tasks.data ?? []).map((t) => {
              const o = (Array.isArray(t.owner) ? t.owner[0] : t.owner) as { full_name: string } | null;
              const late = t.status !== "done" && t.due_at && Date.parse(t.due_at as string) < Date.now();
              return (
                <li key={t.id as string} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div><p className="text-sm">{t.title as string}</p><p className="text-xs text-ink-soft">{o?.full_name ?? "Unassigned"}{t.due_at ? ` · ${formatDateIST(t.due_at as string)}` : ""}</p></div>
                  {late ? <Badge tone="burgundy">Overdue</Badge> : <Badge>{String(t.status).replace(/_/g, " ")}</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

async function Payments({ supabase, w, id, role, eventEnded }: { supabase: Supa; w: WeddingRow; id: string; role: string; eventEnded: boolean }) {
  const { data: payments } = await supabase.from("payments").select("*").eq("wedding_id", id).order("sort");
  const paid = (payments ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount_paise), 0);
  const effectText = (e: unknown) => (isEffect(e) && e !== "none" ? ` · ${EFFECT_LABELS[e].toLowerCase()}` : "");
  return (
    <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Payment parts" subtitle={`${rupees(paid)} of ${rupees(w.contract_value_paise as number | null)} received`} />
          <ul className="divide-y divide-line/70">
            {(payments ?? []).length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">{["owner", "accounts", "sales"].includes(role) ? "No payment parts yet." : "Payments are visible to Prashanth, sales and accounts."}</li> : null}
            {(payments ?? []).map((p) => (
              <li key={p.id as string} className="flex items-start justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{p.label as string}</p>
                  <p className="text-xs text-ink-soft">{p.percent_bps != null ? `${Number(p.percent_bps) / 100}% · ` : ""}{rupees(Number(p.amount_paise))} · due {formatDateIST(p.due_on as string)}{effectText(p.effect)}</p>
                  {p.status === "paid" ? <p className="text-xs text-ink-soft">Received {p.paid_at ? formatDateIST(p.paid_at as string) : ""}{p.method ? ` by ${METHOD_LABELS[p.method as string] ?? String(p.method)}` : ""}{p.gateway_ref ? ` · ref ${p.gateway_ref as string}` : ""}{p.receipt_number ? <> · <a href={`/api/finance/receipt/${p.id as string}`} target="_blank" rel="noreferrer" className="text-sage-700 underline">Receipt {p.receipt_number as string}</a></> : null}</p> : null}
                </div>
                <span className="flex flex-col items-end gap-1">
                  <Badge tone={p.status === "paid" ? "solid" : p.status === "overdue" ? "burgundy" : "gold"}>{String(p.status).replace(/_/g, " ")}</Badge>
                  {p.status !== "paid" && ["owner", "accounts"].includes(role) ? <PaymentForm weddingId={id} paymentId={p.id as string} amountRupees={Number(p.amount_paise) / 100} /> : null}
                </span>
              </li>
            ))}
          </ul>
          {role === "owner" && w.contract_value_paise ? (
            <div className="border-t border-line/70 px-4 py-3">
              <WeddingPartsForm weddingId={id} totalRupees={Number(w.contract_value_paise) / 100}
                initial={(payments ?? []).map((p) => { const e: unknown = p.effect; return { id: p.id as string, label: p.label as string, percent: Number(p.percent_bps ?? 0) / 100, dueOn: p.due_on as string, effect: isEffect(e) ? e : ("none" as const), paid: p.status === "paid" }; })} />
            </div>
          ) : null}
        </Card>
      </div>
      <div className="space-y-5">
        {role === "owner" || role === "accounts" ? <CostingCard supabase={supabase} weddingId={id} role={role} /> : <PlanningPanels supabase={supabase} weddingId={id} role={role} show={["quote"]} />}
        <OperationsPanels supabase={supabase} weddingId={id} role={role} eventEnded={eventEnded} show={["invoices"]} />
      </div>
    </div>
  );
}

async function Family({ supabase, id, canEdit }: { supabase: Supa; id: string; canEdit: boolean }) {
  const [members, family] = await Promise.all([
    supabase.from("wedding_members").select("*").eq("wedding_id", id).order("created_at"),
    supabase.from("wedding_contacts").select("contact_id, relation, is_key_contact, contact:contacts(full_name, phone_e164, email)").eq("wedding_id", id),
  ]);
  return (
    <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
      <Card>
        <CardHeader title="Family contacts" subtitle="Key contacts join the family WhatsApp group" />
        <ul className="divide-y divide-line/70">
          {(family.data ?? []).map((fc) => {
            const c = (Array.isArray(fc.contact) ? fc.contact[0] : fc.contact) as { full_name: string; phone_e164: string | null; email: string | null } | null;
            return (
              <li key={fc.contact_id as string} className="flex items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0"><p className="text-sm font-medium">{c?.full_name} <span className="text-xs font-normal text-ink-soft">· {(fc.relation as string | null) ?? "Family"}</span></p><p className="text-xs text-ink-soft">{[c?.phone_e164, c?.email].filter(Boolean).join(" · ")}</p></div>
                {fc.is_key_contact ? <Badge>key contact</Badge> : null}
              </li>
            );
          })}
        </ul>
        {canEdit ? <div className="border-t border-line/70 px-4 py-3"><FamilyForm weddingId={id} /></div> : null}
      </Card>
      <Card>
        <CardHeader title="Portal logins" subtitle="Who can sign in to the couple's portal" action={<Link href="/team/clients" className="text-sm text-sage-700 underline">Sign-in links</Link>} />
        <ul className="divide-y divide-line/70">
          {(members.data ?? []).length === 0 ? <li className="px-4 py-3 text-sm text-ink-soft">No portal logins yet.</li> : null}
          {(members.data ?? []).map((mm) => (
            <li key={mm.id as string} className="px-4 py-3">
              <p className="text-sm font-medium">{mm.display_name as string} <span className="text-xs font-normal capitalize text-ink-soft">· {String(mm.member_role)}</span></p>
              <p className="text-xs text-ink-soft">{mm.email as string}{mm.accepted_at ? "" : " · not signed in yet"}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {mm.can_start_stages ? <Badge>starts stages</Badge> : null}
                {mm.can_edit_brief ? <Badge>edits brief</Badge> : null}
                {mm.can_approve ? <Badge>approves</Badge> : null}
                {mm.can_view_payments ? <Badge>sees payments</Badge> : null}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
