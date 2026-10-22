import { Badge, buttonClass, Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { openSpacePhotos } from "@/app/team/catalogue/space-photos";
import { AreaForm } from "@/app/team/decor/areas/area-form";
import { requireAnySection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Spaces" };

type Photo = { url: string; thumb_url: string | null; look: string; is_primary: boolean; kind: string };

/**
 * Every place on the estate in one list (D44): the bookable spaces (lawns,
 * halls) and the smaller areas décor is planned for. Photos taken here feed
 * the AI moodboards (plain ones) and the Content studio (all of them).
 */
export default async function SpacesPage() {
  const viewer = await requireAnySection(["venue", "decor"]);
  const canEdit = ["owner", "event_manager", "staff"].includes(viewer.profile.role);
  const supabase = await createClient();
  const [areas, photos, spaces] = await Promise.all([
    supabase.from("venue_areas").select("id, name, kind, description, suits, active, sort, space_id").order("active", { ascending: false }).order("sort").order("name"),
    supabase.from("media_assets").select("url, thumb_url, venue_area_id, look, is_primary, kind").not("venue_area_id", "is", null).eq("kind", "image"),
    supabase.from("spaces").select("id, name, kind, capacity_seated, capacity_floating, active, sort").order("sort"),
  ]);
  const byArea = new Map<string, Photo[]>();
  for (const p of photos.data ?? []) byArea.set(p.venue_area_id as string, [...(byArea.get(p.venue_area_id as string) ?? []), p as Photo]);
  const spaceById = new Map((spaces.data ?? []).map((s) => [s.id as string, s]));
  const list = areas.data ?? [];
  const linked = new Set(list.map((a) => a.space_id as string | null).filter(Boolean));
  const bare = (spaces.data ?? []).filter((s) => s.active && !linked.has(s.id as string));
  const spaceOptions = (spaces.data ?? []).filter((s) => s.active).map((s) => ({ id: s.id as string, name: s.name as string }));
  const needPhoto = list.filter((a) => a.active && !(byArea.get(a.id as string) ?? []).some((p) => p.look === "plain")).length + bare.length;

  return (
    <>
      <PageTitle
        title="Spaces"
        subtitle="Every lawn, hall and corner of the estate, with photos. Plain photos (no décor) are what AI moodboards dress; every photo can be used in the Content studio."
        action={canEdit ? <Link href="/team/catalogue/spaces" className={buttonClass("ghost", "sm")}>Capacity & calendar settings</Link> : undefined}
      />
      {needPhoto ? <p className="mb-4 rounded-xl bg-gold-50 px-4 py-3 text-sm ring-1 ring-gold-300">{needPhoto} space{needPhoto === 1 ? " needs" : "s need"} a plain photo. Tap one to add photos.</p> : null}
      {canEdit ? (
        <details className="mb-5 rounded-2xl border border-line bg-white p-4 [&_summary]:cursor-pointer">
          <summary className="font-medium text-sage-800">+ Add a space or area</summary>
          <div className="mt-3"><AreaForm id={null} spaces={spaceOptions} /></div>
        </details>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {bare.map((s) => (
          <li key={s.id as string}>
            <Card className="h-full overflow-hidden">
              <div className="grid h-44 place-items-center bg-ivory-100 text-sm text-ink-soft">No photos yet</div>
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2"><p className="font-serif text-lg font-semibold">{s.name as string}</p><Badge tone="gold">Needs photos</Badge></div>
                <p className="text-xs text-ink-soft">Bookable · seats {s.capacity_seated as number}{s.capacity_floating ? ` · ${s.capacity_floating as number} standing` : ""}</p>
                {canEdit ? <form action={async () => { "use server"; await openSpacePhotos(s.id as string); }}><button className={buttonClass("secondary", "sm")}>Add photos</button></form> : null}
              </div>
            </Card>
          </li>
        ))}
        {list.map((a) => {
          const ps = byArea.get(a.id as string) ?? [];
          const plain = ps.filter((p) => p.look === "plain");
          const main = ps.find((p) => p.is_primary) ?? plain[0] ?? ps[0];
          const extra = ps.filter((p) => p !== main).slice(0, 3);
          const sp = a.space_id ? spaceById.get(a.space_id as string) : undefined;
          return (
            <li key={a.id as string}>
              <Link href={`/team/decor/areas/${a.id as string}`} className="block h-full">
                <Card className={`h-full overflow-hidden transition-shadow hover:shadow-md ${a.active ? "" : "opacity-60"}`}>
                  {main ? <img src={main.thumb_url ?? main.url} alt={a.name as string} loading="lazy" className="h-44 w-full object-cover" /> : <div className="grid h-44 place-items-center bg-ivory-100 text-sm text-ink-soft">No photos yet</div>}
                  {extra.length ? <div className="grid grid-cols-3 gap-0.5">{extra.map((p) => <img key={p.url} src={p.thumb_url ?? p.url} alt="" loading="lazy" className="h-16 w-full object-cover" />)}</div> : null}
                  <div className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-serif text-lg font-semibold">{a.name as string}</p>
                      <Badge tone={plain.length ? "solid" : "gold"}>{ps.length ? `${ps.length} photo${ps.length === 1 ? "" : "s"}` : "Needs photos"}</Badge>
                    </div>
                    <p className="text-xs text-ink-soft">
                      {sp ? `Bookable · seats ${sp.capacity_seated as number}${sp.capacity_floating ? ` · ${sp.capacity_floating as number} standing` : ""}` : "Décor area"}
                      {(a.suits as string[]).length ? ` · ${(a.suits as string[]).join(", ")}` : ""}
                    </p>
                    {a.description ? <p className="line-clamp-2 text-sm text-ink-soft">{a.description as string}</p> : null}
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
