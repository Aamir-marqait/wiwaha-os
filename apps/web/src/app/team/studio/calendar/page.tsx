import { addDays, formatDateIST, todayIST } from "@wiwaha/db";
import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FORMAT_LABELS, STATUS_LABELS, StudioTabs } from "../tabs";
import { MakeAll } from "./make-all";
import { PlanForm } from "./plan-form";

export const metadata = { title: "Content calendar" };

export default async function StudioCalendar() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const today = todayIST();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const nextMonday = addDays(today, 7 - dow);
  const [{ data: brand }, { data: plans }, { data: items }] = await Promise.all([
    supabase.from("studio_brand").select("profile").eq("id", 1).maybeSingle(),
    supabase.from("studio_plans").select("id, start_on, end_on, status, posts_per_week, notes, rationale").gte("end_on", addDays(today, -14)).order("start_on"),
    supabase.from("studio_items").select("id, title, content_type, status, scheduled_for, pillar").gte("scheduled_for", addDays(today, -7)).lte("scheduled_for", addDays(today, 42)).neq("status", "discarded").order("scheduled_for"),
  ]);
  const pillars = (((brand?.profile ?? {}) as { pillars?: string[] }).pillars ?? []);
  const waiting = (items ?? []).filter((i) => i.status === "draft").length;
  const byDay = new Map<string, NonNullable<typeof items>>();
  for (const i of items ?? []) byDay.set(i.scheduled_for as string, [...(byDay.get(i.scheduled_for as string) ?? []), i]);
  return (
    <>
      <PageTitle title="Calendar" subtitle="Three steps: choose how many posts, the studio writes a script for each, then turn the scripts into content." />
      <StudioTabs active="calendar" />
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-4 sm:p-5"><h2 className="mb-3 font-serif text-xl font-semibold">1 · How many posts?</h2><PlanForm pillars={pillars} nextMonday={nextMonday} /></Card>
        <div className="space-y-5">
          {(plans ?? []).map((p) => (
            <Card key={p.id as string} className="p-4 text-sm">
              <p className="font-medium">{formatDateIST(p.start_on as string, { day: "numeric", month: "short" })} – {formatDateIST(p.end_on as string, { day: "numeric", month: "short" })} · {p.posts_per_week as number} a week <Badge tone={p.status === "ready" ? "solid" : p.status === "failed" ? "burgundy" : "gold"}>{p.status === "planning" ? "Planning…" : (p.status as string)}</Badge></p>
              {p.rationale ? <p className="mt-1 text-ink-soft">{p.rationale as string}</p> : null}
            </Card>
          ))}
          <Card>
            <CardHeader title="2 · Scripts, then 3 · content" subtitle="Open a script to read or change it. Or make them all at once." />
            {waiting > 0 ? <div className="border-b border-line/70 px-4 py-3 sm:px-5"><MakeAll waiting={waiting} /></div> : null}
            <ul className="divide-y divide-line/70">
              {byDay.size === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing scheduled yet.</li> : null}
              {[...byDay.entries()].map(([d, list]) => (
                <li key={d} className="px-4 py-3 sm:px-5">
                  <p className="text-sm font-medium">{formatDateIST(d, { weekday: "short", day: "numeric", month: "short" })}</p>
                  <ul className="mt-1 space-y-1">
                    {list.map((i) => { const st = STATUS_LABELS[i.status as string] ?? STATUS_LABELS.draft!; return <li key={i.id as string}><Link href={`/team/studio/${i.id as string}`} className="flex flex-wrap items-center gap-1.5 text-sm hover:underline"><Badge>{FORMAT_LABELS[i.content_type as string]}</Badge><Badge tone={st.tone}>{st.label}</Badge>{i.title as string}</Link></li>; })}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
