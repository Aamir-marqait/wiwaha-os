import { formatDateIST } from "@wiwaha/db";
import { Badge, Card, PageTitle, buttonClass, cn } from "@wiwaha/ui";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { fal } from "@/lib/media/config";
import { createClient } from "@/lib/supabase/server";
import { usageThisMonth } from "../actions";
import { FORMAT_LABELS, STATUS_LABELS, StudioStatus, StudioTabs } from "../tabs";

export const metadata = { title: "Content Studio" };

const FILTERS = [
  { key: "todo", label: "To approve", statuses: ["draft", "drafting"] },
  { key: "rendering", label: "Rendering", statuses: ["approved", "generating"] },
  { key: "ready", label: "Ready to post", statuses: ["generated"] },
  { key: "attention", label: "Needs attention", statuses: ["failed"] },
  { key: "all", label: "All", statuses: ["drafting", "draft", "approved", "generating", "generated", "failed"] },
  { key: "discarded", label: "Discarded", statuses: ["discarded"] },
] as const;

/** Every script, from idea to finished file. Approve one at a time; download and post. */
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const { f } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  const supabase = await createClient();
  const [{ data }, usage, counts] = await Promise.all([
    supabase.from("studio_items").select("id, content_type, title, hook, status, scheduled_for, pillar, outputs, created_at, created_by_agent").in("status", [...filter.statuses]).order("scheduled_for", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(120),
    usageThisMonth(),
    supabase.from("studio_items").select("status"),
  ]);
  const count = (statuses: readonly string[]) => (counts.data ?? []).filter((r) => statuses.includes(r.status as string)).length;
  const low = usage.allowance - usage.used <= usage.warnAt;
  return (
    <>
      <PageTitle title="Content Studio" subtitle="Scripts, carousels, posts, stories and reels from the estate's own photos. Approve each script once; download and post." action={<Link href="/team/studio" className={buttonClass("primary", "sm")}>+ Create</Link>} />
      <StudioTabs active="content" />
      <StudioStatus used={usage.used} allowance={usage.allowance} low={low} live={fal().live} />
      <nav aria-label="Filter" className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-1.5">
          {FILTERS.map((x) => <li key={x.key} className="shrink-0"><Link href={`/team/studio/content?f=${x.key}`} className={cn("block rounded-full px-3 py-1 text-sm ring-1", x.key === filter.key ? "bg-ink text-white ring-ink" : "bg-white ring-line")}>{x.label}{x.key !== "all" && x.key !== "discarded" ? ` · ${count(x.statuses)}` : ""}</Link></li>)}
        </ul>
      </nav>
      {(data ?? []).length === 0 ? <Card className="p-5 text-sm text-ink-soft">Nothing here. <Link href="/team/studio" className="underline">Create a post</Link> or <Link href="/team/studio/calendar" className="underline">plan a few weeks</Link>.</Card> : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((i) => {
          const out = (i.outputs ?? {}) as { slides?: string[]; poster_url?: string };
          const thumb = out.poster_url ?? out.slides?.[0];
          const st = STATUS_LABELS[i.status as string] ?? STATUS_LABELS.draft!;
          return (
            <li key={i.id as string}>
              <Link href={`/team/studio/${i.id as string}`} className="block h-full">
                <Card className="flex h-full gap-3 p-3 transition-shadow hover:shadow-md">
                  {thumb ? <img src={thumb} alt="" className="h-24 w-20 shrink-0 rounded-lg object-cover" /> : <div className="grid h-24 w-20 shrink-0 place-items-center rounded-lg bg-ivory-100 text-[11px] text-ink-soft">{FORMAT_LABELS[i.content_type as string]}</div>}
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap gap-1"><Badge tone={st.tone}>{st.label}</Badge><Badge>{FORMAT_LABELS[i.content_type as string]}</Badge></p>
                    <p className="line-clamp-2 text-sm font-medium">{i.title as string}</p>
                    <p className="text-xs text-ink-soft">{i.scheduled_for ? formatDateIST(i.scheduled_for as string, { weekday: "short", day: "numeric", month: "short" }) : "Not scheduled"}{i.pillar ? ` · ${i.pillar as string}` : ""}{i.created_by_agent ? " · planned" : ""}</p>
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
