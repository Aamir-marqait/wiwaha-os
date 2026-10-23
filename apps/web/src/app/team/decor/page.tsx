import { Badge, Card, PageTitle } from "@wiwaha/ui";
import { formatDateIST, todayIST } from "@wiwaha/db";
import { requireSection } from "@/lib/auth";
import { CONDITION_LABELS, CONDITION_TONE, isCondition, pretty } from "@/lib/decor";
import { createClient } from "@/lib/supabase/server";
import { type EventOption, ItemActions, ItemForm, QuantityStepper } from "./decor-forms";
import { DecorTabs } from "./tabs";

export const metadata = { title: "Décor stock" };

/** Every piece of décor we own: photographed, counted, its condition, and what's promised to events. */
export default async function DecorStockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireSection("decor");
  const { q } = await searchParams;
  const canEdit = ["owner", "event_manager", "staff"].includes(viewer.profile.role);
  const supabase = await createClient();
  const today = todayIST();
  const [items, promised, weddings, venueAreas] = await Promise.all([
    supabase.from("decor_items").select("*").order("active", { ascending: false }).order("category").order("name"),
    supabase.from("decor_assignments").select("decor_item_id, quantity, wedding:weddings(event_end)").in("status", ["planned", "set_up"]),
    supabase.from("weddings").select("id, title, event_start, event_end, functions:event_functions(id, name, date)").gte("event_end", today).neq("status", "cancelled").order("event_start"),
    supabase.from("venue_areas").select("name").eq("active", true).order("sort"),
  ]);
  const areas = [...(venueAreas.data ?? []).map((a) => a.name as string), "Other"];
  const out = new Map<string, number>();
  for (const a of promised.data ?? []) {
    const w = (Array.isArray(a.wedding) ? a.wedding[0] : a.wedding) as { event_end: string } | null;
    if (w && w.event_end >= today) out.set(a.decor_item_id as string, (out.get(a.decor_item_id as string) ?? 0) + Number(a.quantity));
  }
  const events: EventOption[] = (weddings.data ?? []).map((w) => ({
    id: w.id as string, title: w.title as string, dates: formatDateIST(w.event_start as string, { day: "numeric", month: "short" }),
    functions: ((w.functions ?? []) as { id: string; name: string; date: string }[]).sort((a, b) => a.date.localeCompare(b.date)).map((f) => ({ id: f.id, name: f.name })),
  }));
  const term = (q ?? "").trim().toLowerCase();
  const list = (items.data ?? []).filter((i) => !term || `${i.name} ${i.category} ${i.location ?? ""}`.toLowerCase().includes(term));

  return (
    <>
      <PageTitle title="Décor" subtitle="Photograph every piece we own, keep count and condition, and assign pieces to an event and the area they'll dress." />
      <DecorTabs active="stock" />
      {canEdit ? (
        <details className="mb-5 rounded-2xl border border-line bg-white p-4 [&_summary]:cursor-pointer">
          <summary className="font-medium text-sage-800">+ Add a piece</summary>
          <div className="mt-3"><ItemForm id={null} /></div>
        </details>
      ) : null}
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search by name, type or where it's stored" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" /></form>
      {list.length === 0 ? <Card className="p-5 text-sm text-ink-soft">{term ? "Nothing matches." : "No décor recorded yet. Add the first piece above."}</Card> : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((i) => {
          const photos = ((i.photos ?? []) as { url: string }[]).map((p) => p.url);
          const busy = out.get(i.id as string) ?? 0;
          const raw: unknown = i.condition;
          const cond = isCondition(raw) ? raw : "good";
          return (
            <li key={i.id as string}>
              <Card className={`h-full overflow-hidden ${i.active ? "" : "opacity-60"}`}>
                {photos[0] ? (
                  <a href={photos[0]} target="_blank" rel="noreferrer" className="block bg-ivory-100"><img src={photos[0]} alt={i.name as string} loading="lazy" className="aspect-[4/3] w-full object-cover" /></a>
                ) : <div className="grid aspect-[4/3] place-items-center bg-ivory-100 text-sm text-ink-soft">No photo yet. Edit to add one.</div>}
                {photos.length > 1 ? <div className="grid grid-cols-4 gap-0.5">{photos.slice(1, 5).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" loading="lazy" className="aspect-square w-full object-cover" /></a>)}</div> : null}
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-serif text-lg font-semibold">{i.name as string}</p>
                    <Badge tone={CONDITION_TONE[cond]}>{CONDITION_LABELS[cond]}</Badge>
                  </div>
                  <p className="text-sm text-ink-soft">{pretty(i.category as string)}{i.location ? ` · ${i.location as string}` : ""}</p>
                  <div className="flex items-end justify-between gap-3 rounded-xl bg-ivory-50 p-2 ring-1 ring-line/70">
                    <div><p className="text-xs uppercase tracking-wide text-ink-soft">We own</p><QuantityStepper id={i.id as string} initial={Number(i.quantity)} canEdit={canEdit} /></div>
                    {busy ? <p className="text-right text-xs text-ink-soft">{busy} promised to<br />upcoming events</p> : null}
                  </div>
                  {i.notes ? <p className="text-xs italic text-ink-soft">{i.notes as string}</p> : null}
                  <ItemActions id={i.id as string} canEdit={canEdit} max={Number(i.quantity)} events={events} areas={areas}
                    initial={{ name: i.name as string, category: i.category as string, photos: photos.join("\n"), quantity: String(i.quantity), condition: cond, location: (i.location as string | null) ?? "", notes: (i.notes as string | null) ?? "", active: i.active as boolean, unitCost: i.unit_cost_paise != null ? String(Number(i.unit_cost_paise) / 100) : "", useCost: i.use_cost_paise != null ? String(Number(i.use_cost_paise) / 100) : "" }} />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
