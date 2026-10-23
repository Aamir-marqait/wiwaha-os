import { Card, cn } from "@wiwaha/ui";
import { formatDateIST, todayIST, type StageStatus } from "@wiwaha/db";
import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Wordmark } from "@/components/brand";
import { CopyField } from "@/components/copy-field";
import { env } from "@/lib/env";
import { StageStatusBadge, UNLOCK_TEXT } from "@/components/stage-status";
import { startStage } from "./actions";
import { SnoozeForm } from "./_ui/forms";
import { AtAGlance } from "./_ui/glance";
import { loadPortal } from "./_ui/load";
import { PortalShell } from "./_ui/shell";

export const metadata: Metadata = { title: "Your wedding" };

const STAGE_TAB: Record<string, string> = { brief: "/portal/brief", menus: "/portal/menus", decor: "/portal/decor", entertainment: "/portal/options/entertainment", extras: "/portal/options/extras", guests_rooms: "/portal/guests", final_payment: "/portal/payments", vendors: "/portal/quote" };

export default async function PortalHome() {
  const { viewer, supabase, t, wedding, me } = await loadPortal({ allowNoWedding: true });
  const first = viewer.profile.full_name.split(" ")[0] ?? "";

  if (!wedding) {
    // The portal closes after the wedding day (policy portal.access).
    const { data: closed } = await supabase.rpc("my_closed_portal");
    const done = ((closed ?? []) as { title: string; event_end: string }[])[0];
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Wordmark subtitle={t.your_portal} />
        <p className="mt-10 font-serif text-3xl">{t.namaste}, {first}</p>
        {done ? (
          <p className="mt-2 text-ink-soft">Thank you for celebrating {done.title} with us. Your planning portal has now closed; your review form, thank-you and photos come to you by email and WhatsApp. We&rsquo;ve loved every moment.</p>
        ) : <p className="mt-2 text-ink-soft">Your planning space will appear here once your event manager has set it up.</p>}
        <form action="/auth/signout?to=portal" method="post" className="mt-8"><button className="text-sm text-sage-700 underline">{t.sign_out}</button></form>
      </main>
    );
  }

  const [stages, messages, planning] = await Promise.all([
    supabase.from("wedding_stages").select("*").eq("wedding_id", wedding.id).order("sort"),
    supabase.from("messages").select("id, body, created_at").eq("wedding_id", wedding.id).eq("client_visible", true).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1),
    supabase.from("policies").select("value").eq("key", "planning.start").maybeSingle(),
  ]);
  // Policy 'planning.start': when early starts aren't allowed, a stage opens on its date.
  const allowEarly = (planning.data?.value as { allow_early_start?: boolean } | null)?.allow_early_start !== false;
  const canStart = !!me?.can_start_stages;
  const today = todayIST();

  return (
    <PortalShell t={t} wedding={wedding} first={first} active="home">
      {(messages.data ?? [])[0] ? (
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-gold-600">{t.from_team}</p><p className="mt-1 whitespace-pre-line text-[15px]">{(messages.data ?? [])[0]!.body as string}</p></Card>
      ) : null}

      <AtAGlance supabase={supabase} weddingId={wedding.id as string} t={t} />

      {wedding.guest_token ? (
        <Card className="space-y-2 p-4">
          <h2 className="font-serif text-xl font-semibold">Additional services for your guests</h2>
          <p className="text-sm text-ink-soft">Share this link with your guests. They leave their name and number and ask for airport pickup or drop, a room request or anything else, and our team follows up with them.</p>
          <CopyField label="Guest link" value={`${env.appUrl()}/g/${wedding.guest_token as string}`} />
        </Card>
      ) : null}

      <section>
        <h2 className="mb-1 mt-2 font-serif text-2xl font-semibold">{t.journey}</h2>
        <p className="mb-4 text-sm text-ink-soft">{t.journey_help}</p>
        <ol className="space-y-3">
          {(stages.data ?? []).map((s) => {
            const status = s.status as StageStatus;
            const locked = status === "locked";
            const early = !!s.recommended_start && (s.recommended_start as string) > today;
            const notYet = early && !allowEarly;
            const startable = status === "not_started" && canStart && !notYet;
            const href = STAGE_TAB[s.key as string];
            const snoozed = s.snoozed_until && (s.snoozed_until as string) >= today;
            return (
              <li key={s.id as string}>
                <Card className={cn("p-4", locked && "bg-ivory-50 shadow-none")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-serif text-xl font-semibold">{locked ? <Lock className="size-4 text-ink-soft" aria-hidden /> : null}{s.name as string}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">{allowEarly ? t.recommended : t.opens_on}: {s.recommended_start ? formatDateIST(s.recommended_start as string) : "on booking"}{snoozed ? ` · snoozed until ${formatDateIST(s.snoozed_until as string)}` : ""}</p>
                      {locked ? <p className="mt-2 text-sm text-ink-soft">{UNLOCK_TEXT[s.unlock_rule as string]}</p> : s.needs_from_client && status !== "done" ? <p className="mt-2 text-sm">{s.needs_from_client as string}</p> : null}
                      {s.owner_label && status !== "not_started" && !locked ? <p className="mt-1 text-xs text-sage-700">With: {s.owner_label as string}</p> : null}
                      {href && s.started_at ? <a href={href} className="mt-2 inline-block text-sm text-sage-700 underline">Open →</a> : null}
                      {status === "not_started" && notYet ? <p className="mt-2 text-sm text-ink-soft">{t.opens_on} {formatDateIST(s.recommended_start as string)}. <a href="/portal/ideas" className="text-sage-700 underline">{t.ideas} →</a></p> : null}
                      {startable && !snoozed ? <div className="mt-1"><SnoozeForm stageId={s.id as string} /></div> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StageStatusBadge status={status} />
                      {startable ? <ActionButton action={startStage.bind(null, s.id as string)} variant="primary" pendingLabel={t.starting} confirm={early ? "You're starting earlier than recommended, which is completely fine. Start now?" : undefined}>{t.start}</ActionButton> : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
        {!canStart ? <p className="mt-3 text-xs text-ink-soft">The couple decides when stages start. Ask them if you&rsquo;d like to begin one.</p> : null}
      </section>
      <p className="pt-4 text-center text-xs text-ink-soft">{t.audit_note}</p>
    </PortalShell>
  );
}
