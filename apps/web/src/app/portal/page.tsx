import { Card, buttonClass, cn } from "@wiwaha/ui";
import { formatDateIST, type StageStatus } from "@wiwaha/db";
import { Lock } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Wordmark } from "@/components/brand";
import { CopyField } from "@/components/copy-field";
import { env } from "@/lib/env";
import { StageStatusBadge, UNLOCK_TEXT } from "@/components/stage-status";
import { startStage } from "./actions";
import { AtAGlance } from "./_ui/glance";
import { loadPortal } from "./_ui/load";
import { planningState } from "./_ui/planning";
import { PortalShell } from "./_ui/shell";

export const metadata: Metadata = { title: "Your wedding" };

const STAGE_TAB: Record<string, string> = { brief: "/portal/brief", menus: "/portal/menus", decor: "/portal/decor", entertainment: "/portal/options/entertainment", extras: "/portal/options/extras", guests_rooms: "/portal/guests", final_payment: "/portal/payments", vendors: "/portal/quote" };

export default async function PortalHome() {
  const { viewer, supabase, t, wedding, me } = await loadPortal({ allowNoWedding: true, anytime: true });
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

  const [stages, messages, brief, boards] = await Promise.all([
    supabase.from("wedding_stages").select("*").eq("wedding_id", wedding.id).order("sort"),
    supabase.from("messages").select("id, body, created_at").eq("wedding_id", wedding.id).eq("client_visible", true).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1),
    supabase.from("decor_briefs").select("status").eq("wedding_id", wedding.id).maybeSingle(),
    supabase.from("moodboards").select("id", { count: "exact", head: true }).eq("wedding_id", wedding.id).eq("source", "ai"),
  ]);
  const plan = planningState(wedding.event_start as string);
  const decorStage = (stages.data ?? []).find((s) => s.key === "decor");
  const briefStatus = (brief.data?.status as string | undefined) ?? null;
  const canFill = !!me?.can_fill_decor;

  // The one thing waiting for them once planning is open: the décor form.
  const decorCard = (() => {
    if (briefStatus === "ready" && (boards.count ?? 0) > 0) return { title: "Your moodboards are ready", text: "Have a look at what we've put together for you.", cta: <Link href="/portal/decor" className={buttonClass("primary", "md")}>See your moodboards</Link> };
    if (briefStatus === "submitted" || briefStatus === "generating" || briefStatus === "ready") return { title: "Thank you, we have your décor form", text: "Our team is preparing your moodboard. It will appear here as soon as it is ready.", cta: null };
    if (!decorStage || decorStage.status === "locked") return { title: "Your décor form is almost ready", text: "It opens as soon as your advance payment is confirmed. We'll let you know.", cta: null };
    if (!decorStage.started_at) return { title: "Fill in your décor form", text: "A few questions about the look and feel you love, so we can create your moodboard.", cta: canFill ? <ActionButton action={startStage.bind(null, decorStage.id as string)} variant="primary" size="md" pendingLabel={t.starting}>Open the décor form</ActionButton> : null };
    return { title: "Fill in your décor form", text: "A few questions about the look and feel you love, so we can create your moodboard.", cta: <Link href="/portal/decor" className={buttonClass("primary", "md")}>Open the décor form</Link> };
  })();

  return (
    <PortalShell t={t} wedding={wedding} first={first} active="home">
      {(messages.data ?? [])[0] ? (
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-gold-600">{t.from_team}</p><p className="mt-1 whitespace-pre-line text-[15px]">{(messages.data ?? [])[0]!.body as string}</p></Card>
      ) : null}

      {plan.open ? (
        <Card className="space-y-2 border-gold-300 bg-gold-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gold-700">Planning is open · {plan.days > 0 ? `${plan.days} days to go` : "today is the day"}</p>
          <h2 className="font-serif text-2xl font-semibold">{decorCard.title}</h2>
          <p className="text-sm text-ink-soft">{decorCard.text}</p>
          {decorCard.cta ? <div className="pt-1">{decorCard.cta}</div> : null}
        </Card>
      ) : (
        <Card className="space-y-2 border-gold-300 bg-gold-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gold-700">Planning opens {formatDateIST(plan.opensOn, { day: "numeric", month: "long", year: "numeric" })} · in {plan.daysUntilOpen} days</p>
          <h2 className="font-serif text-2xl font-semibold">Share your ideas for now</h2>
          <p className="text-sm text-ink-soft">Planning opens 90 days before your wedding. Until then, send us every idea, picture or link you love, as many as you like. Our team reads each one and uses them when planning begins.</p>
          <div className="pt-1"><Link href="/portal/ideas" className={buttonClass("primary", "md")}>Share your ideas</Link></div>
        </Card>
      )}

      <AtAGlance supabase={supabase} weddingId={wedding.id as string} t={t} />

      {wedding.guest_token ? (
        <Card className="space-y-2 p-4">
          <h2 className="font-serif text-xl font-semibold">Additional services for your guests</h2>
          {plan.open ? (
            <>
              <p className="text-sm text-ink-soft">Share this link with your guests. They leave their name and number and ask for airport pickup or drop, a room request or anything else, and our team follows up with them.</p>
              <CopyField label="Guest link" value={`${env.appUrl()}/g/${wedding.guest_token as string}`} />
            </>
          ) : <p className="flex items-center gap-2 text-sm text-ink-soft"><Lock className="size-4" aria-hidden /> This link opens with planning, on {formatDateIST(plan.opensOn, { day: "numeric", month: "long" })}.</p>}
        </Card>
      ) : null}

      <section>
        <h2 className="mb-1 mt-2 font-serif text-2xl font-semibold">{t.journey}</h2>
        <p className="mb-4 text-sm text-ink-soft">{plan.open ? "Where each part of your planning stands. Your event manager sets these up with you." : `Everything below opens on ${formatDateIST(plan.opensOn, { day: "numeric", month: "long", year: "numeric" })}, 90 days before your wedding.`}</p>
        <ol className="space-y-3">
          {(stages.data ?? []).map((s) => {
            const status = s.status as StageStatus;
            const locked = !plan.open || status === "locked";
            const href = STAGE_TAB[s.key as string];
            return (
              <li key={s.id as string}>
                <Card className={cn("p-4", locked && "bg-ivory-50 shadow-none")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-serif text-xl font-semibold">{locked ? <Lock className="size-4 text-ink-soft" aria-hidden /> : null}{s.key === "extras" ? t.extras : (s.name as string)}</p>
                      {!plan.open ? <p className="mt-0.5 text-xs text-ink-soft">Opens {formatDateIST(plan.opensOn, { day: "numeric", month: "short", year: "numeric" })}</p>
                        : status === "locked" ? <p className="mt-2 text-sm text-ink-soft">{UNLOCK_TEXT[s.unlock_rule as string]}</p>
                        : s.needs_from_client && status !== "done" ? <p className="mt-2 text-sm">{s.needs_from_client as string}</p> : null}
                      {plan.open && s.owner_label && status !== "not_started" && !locked ? <p className="mt-1 text-xs text-sage-700">With: {s.owner_label as string}</p> : null}
                      {plan.open && href && s.started_at ? <a href={href} className="mt-2 inline-block text-sm text-sage-700 underline">Open →</a> : null}
                    </div>
                    {plan.open ? <div className="flex shrink-0 flex-col items-end gap-2"><StageStatusBadge status={status} /></div> : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="pt-4 text-center text-xs text-ink-soft">{t.audit_note}</p>
    </PortalShell>
  );
}
