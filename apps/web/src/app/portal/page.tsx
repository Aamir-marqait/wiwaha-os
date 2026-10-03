import { Card, cn } from "@wiwaha/ui";
import { daysBetween, formatDateIST, rupees, todayIST, type StageStatus } from "@wiwaha/db";
import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Wordmark } from "@/components/brand";
import { StageStatusBadge, UNLOCK_TEXT } from "@/components/stage-status";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startStage } from "./actions";

export const metadata: Metadata = { title: "Your wedding" };

export default async function PortalHome() {
  const viewer = await requireClient();
  const supabase = await createClient("portal");
  const { data: wedding } = await supabase.from("weddings").select("*").order("event_start").limit(1).maybeSingle();
  const first = viewer.profile.full_name.split(" ")[0];

  if (!wedding) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Wordmark subtitle="Your wedding portal" />
        <p className="mt-10 font-serif text-3xl">Hello, {first}</p>
        <p className="mt-2 text-ink-soft">Your planning space will appear here once your event manager has set it up.</p>
        <form action="/auth/signout?to=portal" method="post" className="mt-8"><button className="text-sm text-sage-700 underline">Sign out</button></form>
      </main>
    );
  }

  const [stages, me, payments, messages] = await Promise.all([
    supabase.from("wedding_stages").select("*").eq("wedding_id", wedding.id).order("sort"),
    supabase.from("wedding_members").select("*").eq("wedding_id", wedding.id).eq("user_id", viewer.userId).maybeSingle(),
    supabase.from("payments").select("*").eq("wedding_id", wedding.id).order("sort"),
    supabase.from("messages").select("id, body, created_at").eq("wedding_id", wedding.id).eq("client_visible", true).order("created_at", { ascending: false }).limit(3),
  ]);
  const canStart = !!me.data?.can_start_stages;
  const today = todayIST();
  const days = daysBetween(today, wedding.event_start as string);

  return (
    <div className="min-h-dvh bg-ivory-100">
      <header className="ornament bg-sage-800 px-4 pb-10 pt-6 text-ivory-50">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Wordmark subtitle="Your wedding portal" light />
          <form action="/auth/signout?to=portal" method="post"><button className="rounded-full bg-white/10 px-3 py-1 text-xs">Sign out</button></form>
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="text-sm text-sage-200">Namaste, {first}</p>
          <h1 className="font-serif text-4xl font-semibold sm:text-5xl">{wedding.title as string}</h1>
          <p className="mt-2 text-sage-100">{formatDateIST(wedding.event_start as string, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {days > 0 ? `${days} days to go` : days === 0 ? "Today!" : "With love, from Wiwaha"}</p>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-3xl space-y-5 px-4 pb-16">
        {(messages.data ?? [])[0] ? (
          <Card className="p-4"><p className="text-xs uppercase tracking-wide text-gold-600">From your Wiwaha team</p><p className="mt-1 text-[15px]">{(messages.data ?? [])[0]!.body as string}</p></Card>
        ) : null}

        <section>
          <h2 className="mb-1 mt-6 font-serif text-2xl font-semibold">Your planning journey</h2>
          <p className="mb-4 text-sm text-ink-soft">Each stage has a recommended start date, but you set the pace. Press Start whenever you&rsquo;re ready.</p>
          <ol className="space-y-3">
            {(stages.data ?? []).map((s) => {
              const status = s.status as StageStatus;
              const locked = status === "locked";
              const startable = status === "not_started" && canStart;
              const early = s.recommended_start && (s.recommended_start as string) > today;
              return (
                <li key={s.id as string}>
                  <Card className={cn("p-4", locked && "bg-ivory-50 shadow-none")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-serif text-xl font-semibold">{locked ? <Lock className="size-4 text-ink-soft" aria-hidden /> : null}{s.name as string}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">Recommended: {s.recommended_start ? formatDateIST(s.recommended_start as string) : "on booking"}</p>
                        {locked ? <p className="mt-2 text-sm text-ink-soft">{UNLOCK_TEXT[s.unlock_rule as string]}</p> : s.needs_from_client && status !== "done" ? <p className="mt-2 text-sm">{s.needs_from_client as string}</p> : null}
                        {s.owner_label && status === "in_progress" ? <p className="mt-1 text-xs text-sage-700">With: {s.owner_label as string}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StageStatusBadge status={status} />
                        {startable ? <ActionButton action={startStage.bind(null, s.id as string)} variant="primary" pendingLabel="Starting…" confirm={early ? "You're starting earlier than recommended, which is completely fine. Start now?" : undefined}>Start</ActionButton> : null}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
          {!canStart ? <p className="mt-3 text-xs text-ink-soft">The couple decides when stages start. Ask them if you&rsquo;d like to begin one.</p> : null}
        </section>

        {(payments.data ?? []).length ? (
          <Card>
            <div className="border-b border-line/70 px-4 py-3"><h2 className="font-serif text-xl font-semibold">Payments</h2></div>
            <ul className="divide-y divide-line/70">
              {(payments.data ?? []).map((p) => (
                <li key={p.id as string} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div><p className="text-sm font-medium">{p.label as string}</p><p className="text-xs text-ink-soft">{rupees(Number(p.amount_paise))} · due {formatDateIST(p.due_on as string)}</p></div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs", p.status === "paid" ? "bg-sage-700 text-white" : "bg-gold-100 text-gold-700")}>{p.status === "paid" ? "Paid, thank you" : "Upcoming"}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <p className="pt-4 text-center text-xs text-ink-soft">Every change you make here is recorded with the time, so your team always knows who decided what.</p>
      </main>
    </div>
  );
}
