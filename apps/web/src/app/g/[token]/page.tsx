import { Card } from "@wiwaha/ui";
import { addDays, formatDateIST, rupees } from "@wiwaha/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const UNIT: Record<string, string> = { each: "each", "per person": "per person", "per function": "per function" };

/** The guest page: shared with everyone staying for a wedding. No login, nothing private. */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();
  const db = createAdminClient("public");
  const { data: w } = await db.from("weddings").select("id, title, event_start, event_end, guest_welcome, status").eq("guest_token", token).maybeSingle();
  if (!w || w.status === "cancelled" || (w.event_end as string) < addDays(new Date().toISOString().slice(0, 10), -3)) notFound();
  const [fns, options, facts] = await Promise.all([
    db.from("event_functions").select("name, date, start_time, space:spaces(name)").eq("wedding_id", w.id).order("date").order("start_time"),
    db.from("service_options").select("id, name, description, image_url, unit, rate_paise").eq("active", true).eq("guest_bookable", true).order("sort").order("name"),
    db.from("policies").select("rule_text").eq("key", "venue.facts").eq("client_visible", true).maybeSingle(),
  ]);
  const days: { value: string; label: string }[] = [];
  for (let d = w.event_start as string; d <= (w.event_end as string); d = addDays(d, 1)) days.push({ value: d, label: formatDateIST(d, { weekday: "short", day: "numeric", month: "short" }) });

  return (
    <main className="min-h-dvh bg-ivory-100">
      <header className="ornament bg-sage-800 px-4 pb-8 pt-6 text-ivory-50">
        <div className="mx-auto max-w-2xl">
          <Wordmark subtitle="Wiwaha by Praman" light />
          <h1 className="mt-6 font-serif text-4xl font-semibold">{w.title as string}</h1>
          <p className="mt-1 text-sage-100">{formatDateIST(w.event_start as string, { weekday: "long", day: "numeric", month: "long" })}{w.event_end !== w.event_start ? ` – ${formatDateIST(w.event_end as string, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : ""}</p>
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <Card className="p-5">
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{(w.guest_welcome as string | null) ?? `Welcome! We're delighted you're joining ${w.title as string} at Wiwaha by Praman. Here's the plan for the celebrations, a little about the estate, and services you can ask us for during your stay.`}</p>
        </Card>

        {(fns.data ?? []).length ? (
          <section>
            <h2 className="mb-2 font-serif text-2xl font-semibold">Itinerary</h2>
            <Card>
              <ol className="divide-y divide-line/70">
                {(fns.data ?? []).map((f, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div><p className="font-medium">{f.name as string}</p><p className="text-sm text-ink-soft">{one(f.space as unknown as { name: string } | null)?.name ?? ""}</p></div>
                    <p className="shrink-0 text-right text-sm">{formatDateIST(f.date as string, { weekday: "short", day: "numeric", month: "short" })}{f.start_time ? <span className="block text-ink-soft">{String(f.start_time).slice(0, 5)}</span> : null}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        ) : null}

        {facts.data ? (
          <section>
            <h2 className="mb-2 font-serif text-2xl font-semibold">The estate</h2>
            <Card className="p-5 text-[15px] leading-relaxed">{facts.data.rule_text as string}</Card>
          </section>
        ) : null}

        {(options.data ?? []).length ? (
          <section>
            <h2 className="mb-1 font-serif text-2xl font-semibold">Services during your stay</h2>
            <p className="mb-3 text-sm text-ink-soft">Ask for any of these and our team will confirm with you. You pay at the venue.</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(options.data ?? []).map((o) => (
                <li key={o.id as string}>
                  <Card className="h-full overflow-hidden">
                    {o.image_url ? <img src={o.image_url as string} alt="" className="h-36 w-full object-cover" /> : null}
                    <div className="space-y-2 p-4">
                      <p className="font-serif text-xl font-semibold">{o.name as string}</p>
                      {o.description ? <p className="text-sm">{o.description as string}</p> : null}
                      {o.rate_paise != null ? <p className="text-sm text-ink-soft">{rupees(Number(o.rate_paise))} {UNIT[o.unit as string] ?? (o.unit as string)}</p> : null}
                      <RequestForm token={token} optionId={o.id as string} days={days} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="pt-2 text-center text-xs text-ink-soft">Wiwaha by Praman · 15 km from Bengaluru airport</p>
      </div>
    </main>
  );
}
