import { Badge, Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DecorTabs } from "../tabs";
import { AreaForm } from "./area-form";

export const metadata = { title: "Venue areas" };

/** Every space décor is planned for, with plain photos (no décor) from several angles: the base for AI moodboards. */
export default async function AreasPage() {
  const viewer = await requireSection("decor");
  const canEdit = ["owner", "event_manager", "staff"].includes(viewer.profile.role);
  const supabase = await createClient();
  const [areas, photos, spaces] = await Promise.all([
    supabase.from("venue_areas").select("id, name, kind, description, suits, active, sort").order("active", { ascending: false }).order("sort").order("name"),
    supabase.from("media_assets").select("id, url, venue_area_id, look, is_primary, kind").not("venue_area_id", "is", null),
    supabase.from("spaces").select("id, name").eq("active", true).order("sort"),
  ]);
  const byArea = new Map<string, { url: string; look: string; is_primary: boolean; kind: string }[]>();
  for (const p of photos.data ?? []) byArea.set(p.venue_area_id as string, [...(byArea.get(p.venue_area_id as string) ?? []), p as { url: string; look: string; is_primary: boolean; kind: string }]);
  const list = areas.data ?? [];
  const missing = list.filter((a) => a.active && !(byArea.get(a.id as string) ?? []).some((p) => p.look === "plain"));
  return (
    <>
      <PageTitle title="Décor" subtitle="Photograph every area as it is, with no décor, from a few angles. AI moodboards dress these photos for each couple." />
      <DecorTabs active="areas" />
      {missing.length ? (
        <Card className="mb-5 border-gold-300 bg-gold-50 p-4 text-sm">
          <p className="font-medium">{missing.length} area{missing.length === 1 ? " has" : "s have"} no plain photo yet</p>
          <p className="text-ink-soft">{missing.map((a) => a.name as string).join(", ")}. Without one, moodboards show our template photos for that area instead of an AI-dressed picture.</p>
        </Card>
      ) : null}
      {canEdit ? (
        <details className="mb-5 rounded-2xl border border-line bg-white p-4 [&_summary]:cursor-pointer">
          <summary className="font-medium text-sage-800">+ Add an area</summary>
          <div className="mt-3"><AreaForm id={null} spaces={(spaces.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))} /></div>
        </details>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => {
          const ps = byArea.get(a.id as string) ?? [];
          const plain = ps.filter((p) => p.look === "plain");
          const main = ps.find((p) => p.is_primary) ?? plain[0] ?? ps.find((p) => p.kind === "image");
          return (
            <li key={a.id as string}>
              <Link href={`/team/decor/areas/${a.id as string}`} className="block h-full">
                <Card className={`h-full overflow-hidden transition-shadow hover:shadow-md ${a.active ? "" : "opacity-60"}`}>
                  {main ? <img src={main.url} alt={a.name as string} loading="lazy" className="h-44 w-full object-cover" /> : <div className="grid h-28 place-items-center bg-ivory-100 text-xs text-ink-soft">No photo yet</div>}
                  <div className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-serif text-lg font-semibold">{a.name as string}</p>
                      <Badge tone={plain.length ? "solid" : "gold"}>{plain.length ? `${plain.length} plain` : "Needs a photo"}</Badge>
                    </div>
                    {a.description ? <p className="line-clamp-2 text-sm text-ink-soft">{a.description as string}</p> : null}
                    <p className="text-xs text-ink-soft">{ps.length} photo{ps.length === 1 ? "" : "s"}{(a.suits as string[]).length ? ` · ${(a.suits as string[]).join(", ")}` : ""}</p>
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
