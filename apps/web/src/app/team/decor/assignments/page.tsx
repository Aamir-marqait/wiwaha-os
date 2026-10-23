import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateIST, todayIST, addDays } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setAssignmentStatus } from "../actions";
import { ReturnForm } from "../decor-forms";

export const metadata = { title: "Décor by event" };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const STATUS: Record<string, { label: string; tone: "gold" | "sage" | "neutral" | "solid" }> = { planned: { label: "planned", tone: "gold" }, set_up: { label: "set up", tone: "sage" }, returned: { label: "back in store", tone: "solid" }, cancelled: { label: "cancelled", tone: "neutral" } };

/** What décor goes to which event, area by area, and getting it back. */
export default async function DecorAssignmentsPage() {
  const viewer = await requireSection("decor");
  const canEdit = ["owner", "event_manager", "staff"].includes(viewer.profile.role);
  const supabase = await createClient();
  const { data } = await supabase.from("decor_assignments")
    .select("id, area, quantity, status, notes, item:decor_items(name, photos), fn:event_functions(name), wedding:weddings(id, title, event_start, event_end)")
    .neq("status", "cancelled").order("created_at");
  const since = addDays(todayIST(), -14);
  const byWedding = new Map<string, { w: { id: string; title: string; event_start: string; event_end: string }; areas: Map<string, NonNullable<typeof data>> }>();
  for (const a of data ?? []) {
    const w = one(a.wedding as unknown as { id: string; title: string; event_start: string; event_end: string } | null);
    if (!w || (w.event_end < since && a.status === "returned")) continue;
    const e = byWedding.get(w.id) ?? { w, areas: new Map() };
    e.areas.set(a.area as string, [...(e.areas.get(a.area as string) ?? []), a]);
    byWedding.set(w.id, e);
  }
  const weddings = [...byWedding.values()].sort((a, b) => a.w.event_start.localeCompare(b.w.event_start));
  return (
    <>
      <PageTitle title="Assignments" subtitle="How much inventory is assigned to which event and on what dates, then setting it up and bringing it back." />
      {weddings.length === 0 ? <Card className="p-5 text-sm text-ink-soft">Nothing assigned yet. Assign pieces to an event from Inventory, or from the event's Décor tab.</Card> : null}
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
        {weddings.map(({ w, areas }) => (
          <Card key={w.id}>
            <CardHeader title={<Link href={`/team/weddings/${w.id}?tab=decor`} className="hover:underline">{w.title}</Link>} subtitle={`${formatDateIST(w.event_start)}${w.event_end !== w.event_start ? ` – ${formatDateIST(w.event_end)}` : ""}`} />
            <div className="space-y-3 px-4 py-3 sm:px-5">
              {[...areas.entries()].map(([area, list]) => (
                <div key={area}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{area}</p>
                  <ul className="mt-1 divide-y divide-line/60">
                    {list.map((a) => {
                      const item = one(a.item as unknown as { name: string; photos: { url: string }[] } | null);
                      const fn = one(a.fn as unknown as { name: string } | null);
                      const st = STATUS[a.status as string] ?? STATUS.planned!;
                      return (
                        <li key={a.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span className="flex min-w-0 items-center gap-2">
                            {item?.photos?.[0]?.url ? <img src={item.photos[0].url} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : null}
                            <span className="min-w-0 text-sm">{item?.name} × {a.quantity as number}{fn ? <span className="text-xs text-ink-soft"> · {fn.name}</span> : null}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1">
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {canEdit && a.status === "planned" ? <ActionButton action={setAssignmentStatus.bind(null, a.id as string, "set_up", undefined)}>Set up</ActionButton> : null}
                            {canEdit && (a.status === "planned" || a.status === "set_up") ? <ReturnForm id={a.id as string} /> : null}
                            {canEdit && a.status === "planned" ? <ActionButton action={setAssignmentStatus.bind(null, a.id as string, "cancelled", undefined)} variant="ghost">Remove</ActionButton> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
