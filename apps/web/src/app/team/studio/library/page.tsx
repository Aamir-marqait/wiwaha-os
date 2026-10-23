import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { MediaCard, type MediaCardData } from "@/components/media-card";
import { MediaUploader } from "@/components/media-uploader";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StudioTabs } from "../tabs";
import { NewFolder, RemoveFolder } from "./folder-forms";

export const metadata = { title: "Library" };

const LOOKS = [["", "Everything"], ["plain", "Plain spaces"], ["event", "Real events"], ["decorated", "Decorated"], ["detail", "Details"], ["people", "People"], ["aerial", "Aerial"]] as const;

/** The estate's own photos and clips, in folders (up to four deep). Every venue picture in a post comes from here. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ folder?: string; look?: string; q?: string; space?: string }> }) {
  const viewer = await requireSection("sales_marketing", ["owner", "sales"]);
  const { folder, look, q, space } = await searchParams;
  const supabase = await createClient();
  const [{ data: folders }, { data: areas }] = await Promise.all([
    supabase.from("media_folders").select("id, name, parent_id").order("sort").order("name"),
    supabase.from("venue_areas").select("id, name").order("sort"),
  ]);
  let query = supabase.from("media_assets").select("id, kind, url, thumb_url, title, description, tags, look, angle, is_primary, venue_area_id, folder_id, duration_ms, status, status_error, described_by, created_at").order("created_at", { ascending: false }).limit(200);
  if (folder) query = query.eq("folder_id", folder);
  if (look) query = query.eq("look", look);
  if (space === "none") query = query.is("venue_area_id", null);
  else if (space) query = query.eq("venue_area_id", space);
  const { data } = await query;
  const term = (q ?? "").trim().toLowerCase();
  const list = ((data ?? []) as MediaCardData[]).filter((m) => !term || `${m.title ?? ""} ${m.description ?? ""} ${m.tags.join(" ")}`.toLowerCase().includes(term));
  const byId = new Map((folders ?? []).map((f) => [f.id as string, f]));
  const path = (id: string | null): { id: string; name: string }[] => { const out: { id: string; name: string }[] = []; let f = id ? byId.get(id) : undefined; let n = 0; while (f && n++ < 5) { out.unshift({ id: f.id as string, name: f.name as string }); f = f.parent_id ? byId.get(f.parent_id as string) : undefined; } return out; };
  const crumbs = path(folder ?? null);
  const children = (folders ?? []).filter((f) => (f.parent_id ?? null) === (folder ?? null));
  const folderOptions = (folders ?? []).map((f) => ({ id: f.id as string, label: path(f.id as string).map((x) => x.name).join(" / ") }));
  const href = (p: Record<string, string | undefined>) => `/team/studio/library?${new URLSearchParams(Object.entries({ folder, look, q, space, ...p }).filter(([, v]) => v) as [string, string][]).toString()}`;
  return (
    <>
      <PageTitle title="Library" subtitle="Photos and clips by space, so it is easy to pick the right one. Each is described automatically; fix any description by hand." />
      <StudioTabs active="library" />
      <nav aria-label="Spaces" className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-1.5">
          {[["", "All spaces"], ...(areas ?? []).map((a) => [a.id as string, a.name as string]), ["none", "No space yet"]].map(([k, l]) => <li key={k} className="shrink-0"><Link href={href({ space: k || undefined })} className={`block rounded-full px-3 py-1.5 text-sm ring-1 ${(space ?? "") === k ? "bg-sage-700 text-white ring-sage-700" : "bg-white ring-line"}`}>{l}</Link></li>)}
        </ul>
      </nav>
      <Card className="mb-4 space-y-3 p-4">
        <nav aria-label="Folders" className="flex flex-wrap items-center gap-1 text-sm">
          <Link href={href({ folder: undefined })} className="underline">All</Link>
          {crumbs.map((c) => <span key={c.id}> / <Link href={href({ folder: c.id })} className="underline">{c.name}</Link></span>)}
        </nav>
        {children.length ? <ul className="flex flex-wrap gap-1.5">{children.map((f) => <li key={f.id as string}><Link href={href({ folder: f.id as string })} className="block rounded-xl border border-line bg-ivory-50 px-3 py-1.5 text-sm">📁 {f.name as string}</Link></li>)}</ul> : null}
        <div className="flex flex-wrap items-center gap-3">
          {crumbs.length < 4 ? <NewFolder parentId={folder ?? null} /> : null}
          {folder ? <RemoveFolder id={folder} parentHref={href({ folder: crumbs.at(-2)?.id })} /> : null}
        </div>
        <MediaUploader folderId={folder ?? null} look={look || undefined} areaId={space && space !== "none" ? space : undefined} />
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="min-w-[12rem] flex-1">{folder ? <input type="hidden" name="folder" value={folder} /> : null}{space ? <input type="hidden" name="space" value={space} /> : null}{look ? <input type="hidden" name="look" value={look} /> : null}<input name="q" defaultValue={q} placeholder="Search descriptions and tags" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" /></form>
        <div className="flex flex-wrap gap-1">{LOOKS.map(([k, l]) => <Link key={k} href={href({ look: k || undefined })} className={`rounded-full px-3 py-1 text-sm ring-1 ${(look ?? "") === k ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{l}</Link>)}</div>
      </div>
      {list.length === 0 ? <Card className="p-5 text-sm text-ink-soft">Nothing here yet. Upload the estate's best photos and clips: real weddings, the lawn at golden hour, décor details, the rooms.</Card> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {list.map((m) => <MediaCard key={m.id} m={m} areas={(areas ?? []).map((a) => ({ id: a.id as string, name: a.name as string }))} folders={folderOptions} canDelete={["owner", "sales"].includes(viewer.profile.role)} />)}
      </ul>
    </>
  );
}
