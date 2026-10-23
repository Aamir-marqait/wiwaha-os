import { formatDateIST } from "@wiwaha/db";
import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { fal } from "@/lib/media/config";
import { createClient } from "@/lib/supabase/server";
import { usageThisMonth } from "./actions";
import { QuickCreate } from "./quick-create";
import { FORMAT_LABELS, STATUS_LABELS, StudioStatus, StudioTabs } from "./tabs";

export const metadata = { title: "Content Studio" };

/** Quick create: describe a post and create it. The week's plan lives in Calendar; finished posts in Content. */
export default async function StudioPage() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const [{ data: brand }, { data: photos }, { data: areas }, { data: waiting }, usage] = await Promise.all([
    supabase.from("studio_brand").select("profile").eq("id", 1).maybeSingle(),
    supabase.from("media_assets").select("id, url, thumb_url, kind, title, venue_area_id").eq("status", "ready").order("created_at", { ascending: false }).limit(160),
    supabase.from("venue_areas").select("id, name").order("sort"),
    supabase.from("studio_items").select("id, title, content_type, status, scheduled_for").in("status", ["draft", "generated", "failed"]).order("created_at", { ascending: false }).limit(6),
    usageThisMonth(),
  ]);
  const pillars = (((brand?.profile ?? {}) as { pillars?: string[] }).pillars ?? []);
  return (
    <>
      <PageTitle title="Content Studio" subtitle="Describe a post and create it. Or plan a few weeks in Calendar." />
      <StudioTabs active="quick" />
      <StudioStatus used={usage.used} allowance={usage.allowance} low={usage.allowance - usage.used <= usage.warnAt} live={fal().live} />
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4 sm:p-5">
          <QuickCreate pillars={pillars} areas={(areas ?? []).map((a) => ({ id: a.id as string, name: a.name as string }))} photos={(photos ?? []).map((p) => ({ id: p.id as string, url: (p.kind === "video" ? p.thumb_url : p.url) as string, kind: p.kind as string, title: (p.title as string | null) ?? "", areaId: (p.venue_area_id as string | null) ?? null }))} />
        </Card>
        <Card>
          <CardHeader title="Waiting for you" action={<Link href="/team/studio/content" className="text-sm text-sage-700 underline">All content</Link>} />
          <ul className="divide-y divide-line/70">
            {(waiting ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing waiting.</li> : null}
            {(waiting ?? []).map((i) => {
              const st = STATUS_LABELS[i.status as string] ?? STATUS_LABELS.draft!;
              return (
                <li key={i.id as string}>
                  <Link href={`/team/studio/${i.id as string}`} className="block px-4 py-3 hover:bg-ivory-50 sm:px-5">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs"><Badge tone={st.tone}>{st.label}</Badge><Badge>{FORMAT_LABELS[i.content_type as string]}</Badge>{i.scheduled_for ? <span className="text-ink-soft">{formatDateIST(i.scheduled_for as string, { day: "numeric", month: "short" })}</span> : null}</p>
                    <p className="mt-1 line-clamp-2 text-sm">{i.title as string}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
