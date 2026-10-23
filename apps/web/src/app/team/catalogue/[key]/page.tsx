import { PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogueEditor } from "@/components/catalogue-editor";
import { requireStaff, viewerSections } from "@/lib/auth";
import { openSpacePhotos } from "../space-photos";
import { CATALOGUES } from "@/lib/catalogue";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: CATALOGUES[key]?.title ?? "List" };
}

/** Where "back" goes: the page the list is edited from, not the long Lists index. */
const BACK: Record<string, [string, string]> = {
  maintenance: ["/team/estate", "Estate upkeep"], inventory: ["/team/estate", "Estate upkeep"],
  spaces: ["/team/spaces", "Spaces"], rooms: ["/team/catalogue/rooms", "Rooms"],
  decor_templates: ["/team/decor/templates", "Templates"], vendors: ["/team/vendors", "Vendors"],
};

export default async function CataloguePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const spec = CATALOGUES[key];
  if (!spec) notFound();
  const viewer = await requireStaff(spec.viewRoles);
  const supabase = await createClient();
  let q = supabase.from(spec.table).select("*");
  if (spec.fixed) q = q.match(spec.fixed);
  for (const o of spec.order) q = q.order(o.column, { ascending: o.ascending !== false });
  const { data } = await q.limit(1000);
  const refs: Record<string, { id: string; label: string }[]> = {};
  for (const f of spec.fields.filter((x) => x.kind === "ref" && x.ref)) {
    const { data: opts } = await supabase.from(f.ref!.table).select(`id, ${f.ref!.label}`).order(f.ref!.label).limit(500);
    refs[f.key] = ((opts ?? []) as unknown as Record<string, unknown>[]).map((o) => ({ id: String(o.id), label: String(o[f.ref!.label] ?? "") }));
  }
  // Spaces carry photos (through their venue area) for moodboards and the Content studio.
  const thumbs: Record<string, string> = {}, notes: Record<string, string> = {};
  const photos = key === "spaces" && viewerSections(viewer).includes("decor") && ["owner", "event_manager", "staff"].includes(viewer.profile.role);
  if (key === "spaces") {
    const { data: areas } = await supabase.from("venue_areas").select("id, space_id").not("space_id", "is", null);
    const ids = (areas ?? []).map((a) => a.id as string);
    const { data: media } = ids.length ? await supabase.from("media_assets").select("url, venue_area_id, is_primary, look").in("venue_area_id", ids) : { data: [] };
    for (const a of areas ?? []) {
      const mine = (media ?? []).filter((m) => m.venue_area_id === a.id);
      const main = mine.find((m) => m.is_primary) ?? mine.find((m) => m.look === "plain") ?? mine[0];
      if (main) thumbs[a.space_id as string] = main.url as string;
      if (mine.length) notes[a.space_id as string] = `${mine.length} photo${mine.length === 1 ? "" : "s"} · used for moodboards and the Content studio`;
    }
  }
  return (
    <>
      <Link href={(BACK[key] ?? ["/team/settings/lists"])[0]} className="text-sm text-sage-700 hover:underline">← {(BACK[key] ?? ["", "All lists"])[1]}</Link>
      <PageTitle title={spec.title} subtitle={spec.description} />
      <CatalogueEditor spec={spec} rows={(data ?? []) as Record<string, unknown>[]} canEdit={spec.editRoles.includes(viewer.profile.role)} refs={refs} thumbs={thumbs} notes={notes} rowAction={photos ? { label: "Photos", action: openSpacePhotos } : undefined} />
    </>
  );
}
