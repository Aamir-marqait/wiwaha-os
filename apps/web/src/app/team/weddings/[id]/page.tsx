import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, rupees, type StageStatus } from "@wiwaha/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StageStatusBadge, UNLOCK_TEXT } from "@/components/stage-status";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PlanningPanels } from "./panels";
import { PaymentForm } from "./panel-forms";
import { WeddingPartsForm } from "./parts-form";
import { EFFECT_LABELS, isEffect } from "@/lib/payment-parts";
import { OperationsPanels } from "./closeout";
import { FamilyForm, FunctionsEditor } from "./family-forms";
import { todayIST } from "@wiwaha/db";

export const metadata = { title: "Wedding Room" };

export default async function WeddingRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ existing?: string; note?: string }> }) {
  const viewer = await requireStaff(["owner", "sales", "event_manager", "accounts", "staff"]);
  const { id } = await params;
  const { existing, note } = await searchParams;
  const supabase = await createClient();
  const { data: w } = await supabase.from("weddings").select("*, manager:profiles!weddings_event_manager_id_fkey(full_name)").eq("id", id).maybeSingle();
  if (!w) notFound();
  const [stages, payments, functions, members, messages, tasks, family, spaces] = await Promise.all([
    supabase.from("wedding_stages").select("*").eq("wedding_id", id).order("sort"),
    supabase.from("payments").select("*").eq("wedding_id", id).order("sort"),
    supabase.from("event_functions").select("*, space:spaces(name)").eq("wedding_id", id).order("date").order("start_time"),
    supabase.from("wedding_members").select("*").eq("wedding_id", id).order("created_at"),
    supabase.from("messages").select("*").eq("wedding_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("tasks").select("id, title, due_at, status, priority, owner:profiles!tasks_owner_id_fkey(full_name)").eq("wedding_id", id).order("due_at"),
    supabase.from("wedding_contacts").select("contact_id, relation, is_key_contact, contact:contacts(full_name, phone_e164, email)").eq("wedding_id", id),
    supabase.from("spaces").select("id, name").eq("active", true).order("sort"),
  ]);
  const canEdit = ["owner", "sales", "event_manager"].includes(viewer.profile.role);
  const m = (Array.isArray(w.manager) ? w.manager[0] : w.manager) as { full_name: string } | null;
  const paid = (payments.data ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount_paise), 0);

  return (
    <>
      <Link href="/team/weddings" className="text-sm text-sage-700 hover:underline">← Weddings</Link>
      {existing ? <p className="mt-3 rounded-xl bg-gold-100 px-4 py-2 text-sm text-gold-700">This family was already booked (same phone number), so you're looking at their existing Wedding Room instead of a duplicate.</p> : null}
      {note ? <p className="mt-3 rounded-xl bg-burgundy-50 px-4 py-2 text-sm text-burgundy-700">{note}</p> : null}
      <div className="mb-5 mt-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">Wedding Room · {w.code as string}</p>
        <h1 className="font-serif text-4xl font-semibold">{w.title as string}</h1>
        <p className="mt-1 text-sm text-ink-soft">{formatDateIST(w.event_start as string, { weekday: "short", day: "numeric", month: "long", year: "numeric" })} – {formatDateIST(w.event_end as string)} · {(w.guest_count as number | null) ?? "?"} guests · {(w.complimentary_rooms as number)} complimentary rooms · Event manager: {m?.full_name ?? "unassigned"}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Planning stages" subtitle="What the couple sees in their portal. They choose when each starts." />
            <ul className="divide-y divide-line/70">
              {(stages.data ?? []).map((s) => (
                <li key={s.id as string} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.name as string}</p>
                    <p className="text-xs text-ink-soft">Recommended {s.recommended_start ? formatDateIST(s.recommended_start as string) : "on booking"} · {UNLOCK_TEXT[s.unlock_rule as string] ?? (s.unlock_rule as string)}{s.started_at ? ` · started ${formatDateIST(s.started_at as string)}` : ""}</p>
                  </div>
                  <StageStatusBadge status={s.status as StageStatus} />
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

          <PlanningPanels supabase={supabase} weddingId={id} role={viewer.profile.role} />
          <OperationsPanels supabase={supabase} weddingId={id} role={viewer.profile.role} eventEnded={(w.event_end as string) < todayIST()} />

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
          {viewer ? (
            <Card>
              <CardHeader title="Payments" subtitle={`${rupees(paid)} of ${rupees(w.contract_value_paise as number | null)} received`} />
              <ul className="divide-y divide-line/70">
                {(payments.data ?? []).map((p) => (
                  <li key={p.id as string} className="flex items-start justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{p.label as string}</p>
                      <p className="text-xs text-ink-soft">{p.percent_bps != null ? `${Number(p.percent_bps) / 100}% · ` : ""}{rupees(Number(p.amount_paise))} · due {formatDateIST(p.due_on as string)}{(() => { const e: unknown = p.effect; return isEffect(e) && e !== "none" ? ` · ${EFFECT_LABELS[e].toLowerCase()}` : ""; })()}</p>
                    </div>
                    <span className="flex flex-col items-end gap-1">
                      <Badge tone={p.status === "paid" ? "solid" : p.status === "overdue" ? "burgundy" : "gold"}>{String(p.status).replace(/_/g, " ")}</Badge>
                      {p.status !== "paid" && ["owner", "accounts"].includes(viewer.profile.role) ? <PaymentForm weddingId={id} paymentId={p.id as string} amountRupees={Number(p.amount_paise) / 100} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {viewer.profile.role === "owner" && w.contract_value_paise ? (
                <div className="border-t border-line/70 px-4 py-3">
                  <WeddingPartsForm weddingId={id} totalRupees={Number(w.contract_value_paise) / 100}
                    initial={(payments.data ?? []).map((p) => ({ id: p.id as string, label: p.label as string, percent: Number(p.percent_bps ?? 0) / 100, dueOn: p.due_on as string, effect: (() => { const e: unknown = p.effect; return isEffect(e) ? e : "none" as const; })(), paid: p.status === "paid" }))} />
                </div>
              ) : null}
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Family and portal" subtitle="Family contacts, and who has their own portal login" />
            <ul className="divide-y divide-line/70">
              {(members.data ?? []).map((mm) => (
                <li key={mm.id as string} className="px-4 py-3">
                  <p className="text-sm font-medium">{mm.display_name as string} <span className="text-xs font-normal capitalize text-ink-soft">· {String(mm.member_role)}</span></p>
                  <p className="text-xs text-ink-soft">{mm.email as string}{mm.accepted_at ? "" : " · invite pending"}</p>
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
          {(family.data ?? []).length || canEdit ? (
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
          ) : null}
          <Card>
            <CardHeader title="Tasks" />
            <ul className="divide-y divide-line/70">
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
    </>
  );
}
