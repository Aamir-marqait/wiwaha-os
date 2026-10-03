import { Badge, Card } from "@wiwaha/ui";
import { formatDateIST } from "@wiwaha/db";
import { MenuApprove } from "../_ui/forms";
import { loadPortal, stageOf } from "../_ui/load";
import { PortalShell } from "../_ui/shell";
import { StageGate } from "../_ui/stage-gate";

export const metadata = { title: "Menus & tasting" };

export default async function MenusPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const stage = await stageOf(supabase, w.id as string, "menus");
  if (!stage?.started_at) return <PortalShell t={t} wedding={w} first={first} active="menus"><StageGate t={t} stage={stage} /></PortalShell>;
  const { data: menus } = await supabase.from("menus").select("id, cuisine, status, plate_count, plate_count_lock_on, plate_count_locked_at, outside_caterer, outside_caterer_name, notes, tasting_status, tasting_at, fn:event_functions(name, date), items:menu_items(id, course, name, is_veg, sort)").eq("wedding_id", w.id).order("created_at");
  return (
    <PortalShell t={t} wedding={w} first={first} active="menus">
      <p className="text-sm text-ink-soft">Our chef proposes a menu for each function. Approve the ones you love; we&rsquo;ll arrange a tasting before anything is final.</p>
      {(menus ?? []).length === 0 ? <Card className="p-5 text-sm text-ink-soft">Your menus are being prepared. They&rsquo;ll appear here shortly.</Card> : null}
      {(menus ?? []).map((m) => {
        const fn = (Array.isArray(m.fn) ? m.fn[0] : m.fn) as { name: string; date: string } | null;
        const items = ((m.items ?? []) as { id: string; course: string; name: string; is_veg: boolean; sort: number }[]).sort((a, b) => a.sort - b.sort);
        return (
          <Card key={m.id as string} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold">{fn?.name}: {m.cuisine as string}</h2>
                <p className="text-xs text-ink-soft">{fn ? formatDateIST(fn.date) : ""} · {(m.plate_count as number | null) ?? "?"} plates{m.plate_count_lock_on ? ` · numbers final on ${formatDateIST(m.plate_count_lock_on as string)}` : ""}</p>
              </div>
              <Badge tone={m.status === "proposed" ? "gold" : "solid"}>{m.status === "proposed" ? "For you to review" : String(m.status).replace(/_/g, " ")}</Badge>
            </div>
            {m.outside_caterer ? <p className="mt-3 text-sm">Your own caterer{m.outside_caterer_name ? ` (${m.outside_caterer_name as string})` : ""}. {m.notes as string}</p> : (
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {items.map((i) => <li key={i.id}><span className={i.is_veg ? "text-sage-700" : "text-burgundy-700"} aria-label={i.is_veg ? "vegetarian" : "non-vegetarian"}>●</span> {i.name} <span className="text-xs capitalize text-ink-soft">· {i.course}</span></li>)}
              </ul>
            )}
            {m.tasting_status && m.tasting_status !== "none" ? <p className="mt-2 text-xs text-ink-soft">Tasting: {String(m.tasting_status)}{m.tasting_at ? ` · ${formatDateIST(m.tasting_at as string)}` : ""}</p> : null}
            {m.status === "proposed" && me?.can_approve ? <div className="mt-4"><MenuApprove menuId={m.id as string} label={t.approve} /></div> : null}
          </Card>
        );
      })}
    </PortalShell>
  );
}
