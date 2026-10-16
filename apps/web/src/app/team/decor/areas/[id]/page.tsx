import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MediaCard, type MediaCardData } from "@/components/media-card";
import { MediaUploader } from "@/components/media-uploader";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DecorTabs } from "../../tabs";
import { AreaForm } from "../area-form";

export const metadata = { title: "Venue area" };

export default async function AreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireSection("decor");
  const canEdit = ["owner", "event_manager", "staff"].includes(viewer.profile.role);
  const supabase = await createClient();
  const [{ data: a }, photos, spaces, areas, templates] = await Promise.all([
    supabase.from("venue_areas").select("*").eq("id", id).maybeSingle(),
    supabase.from("media_assets").select("id, kind, url, thumb_url, title, description, tags, look, angle, is_primary, venue_area_id, folder_id, duration_ms, status, status_error, described_by, created_at").eq("venue_area_id", id).order("is_primary", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("spaces").select("id, name").eq("active", true).order("sort"),
    supabase.from("venue_areas").select("id, name").order("sort"),
    supabase.from("decor_templates").select("id, title, area").eq("venue_area_id", id),
  ]);
  if (!a) notFound();
  const list = (photos.data ?? []) as MediaCardData[];
  const plain = list.filter((p) => p.look === "plain");
  const others = list.filter((p) => p.look !== "plain");
  const areaOptions = (areas.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string }));
  return (
    <>
      <PageTitle title={a.name as string} subtitle={<Link href="/team/decor/areas" className="underline">← Venue areas</Link>} />
      <DecorTabs active="areas" />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <div>
              <h2 className="font-serif text-xl font-semibold">As it is (no décor)</h2>
              <p className="text-sm text-ink-soft">Daylight, empty, from where guests see it. Add a few angles; the main photo is the one moodboards dress.</p>
            </div>
            {canEdit ? <MediaUploader areaId={id} look="plain" videos={false} label="Upload plain photos" /> : null}
            {plain.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{plain.map((m) => <MediaCard key={m.id} m={m} areas={areaOptions} canDelete={canEdit} showPrimary />)}</ul> : <p className="text-sm text-ink-soft">No plain photos yet.</p>}
          </Card>
          <Card className="space-y-3 p-4">
            <div>
              <h2 className="font-serif text-xl font-semibold">Dressed and at events</h2>
              <p className="text-sm text-ink-soft">Our past setups here. The Content Studio uses these for posts and reels.</p>
            </div>
            {canEdit ? <MediaUploader areaId={id} look="event" label="Upload event photos or clips" /> : null}
            {others.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{others.map((m) => <MediaCard key={m.id} m={m} areas={areaOptions} canDelete={canEdit} />)}</ul> : <p className="text-sm text-ink-soft">None yet.</p>}
          </Card>
        </div>
        <div className="space-y-5">
          {canEdit ? (
            <Card className="p-4">
              <h2 className="mb-2 font-serif text-lg font-semibold">About this area</h2>
              <AreaForm id={id} spaces={(spaces.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))} initial={{ name: a.name as string, kind: a.kind as string, description: (a.description as string | null) ?? "", suits: (a.suits as string[]) ?? [], spaceId: (a.space_id as string | null) ?? null, sort: String(a.sort), active: a.active as boolean }} />
            </Card>
          ) : null}
          <Card className="p-4 text-sm">
            <h2 className="mb-1 font-serif text-lg font-semibold">Templates for this area</h2>
            {(templates.data ?? []).length ? <ul className="list-disc pl-5">{(templates.data ?? []).map((t) => <li key={t.id as string}>{t.title as string}</li>)}</ul> : <p className="text-ink-soft">None linked yet. In <Link href="/team/decor/templates" className="underline">Templates by area</Link>, choose this area on a template; its photos guide the AI's style here.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
