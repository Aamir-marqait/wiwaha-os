import { Card, PageTitle } from "@wiwaha/ui";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuickCreate } from "./quick-create";
import { StudioTabs } from "./tabs";

export const metadata = { title: "Content Studio" };

/** Quick create: describe a post and create it. The week's plan lives in Calendar; finished posts in Content. */
export default async function StudioPage() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const [{ data: brand }, { data: photos }, { data: areas }] = await Promise.all([
    supabase.from("studio_brand").select("profile").eq("id", 1).maybeSingle(),
    supabase.from("media_assets").select("id, url, thumb_url, kind, title, venue_area_id").eq("status", "ready").order("created_at", { ascending: false }).limit(160),
    supabase.from("venue_areas").select("id, name").order("sort"),
  ]);
  const pillars = (((brand?.profile ?? {}) as { pillars?: string[] }).pillars ?? []);
  return (
    <>
      <PageTitle title="Content Studio" subtitle="Describe a post and create it. Or plan a few weeks in Calendar." />
      <StudioTabs active="quick" />
      <div className="max-w-3xl">
        <Card className="p-4 sm:p-5">
          <QuickCreate pillars={pillars} areas={(areas ?? []).map((a) => ({ id: a.id as string, name: a.name as string }))} photos={(photos ?? []).map((p) => ({ id: p.id as string, url: (p.kind === "video" ? p.thumb_url : p.url) as string, kind: p.kind as string, title: (p.title as string | null) ?? "", areaId: (p.venue_area_id as string | null) ?? null }))} />
        </Card>
      </div>
    </>
  );
}
