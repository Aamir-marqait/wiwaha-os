import { Badge, Card, CardHeader } from "@wiwaha/ui";
import Link from "next/link";
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Our own décor stock assigned to this wedding, area by area. */
export async function DecorStockCard({ supabase, weddingId }: { supabase: Supa; weddingId: string }) {
  const { data } = await supabase.from("decor_assignments").select("id, area, quantity, status, item:decor_items(name, photos), fn:event_functions(name)").eq("wedding_id", weddingId).neq("status", "cancelled").order("area");
  const byArea = new Map<string, NonNullable<typeof data>>();
  for (const a of data ?? []) byArea.set(a.area as string, [...(byArea.get(a.area as string) ?? []), a]);
  return (
    <Card>
      <CardHeader title="Décor from our stock" subtitle="Pieces assigned to this wedding, by area" action={<Link href="/team/decor" className="text-sm text-sage-700 underline">Assign from stock</Link>} />
      {byArea.size === 0 ? <p className="px-5 py-4 text-sm text-ink-soft">Nothing assigned yet.</p> : (
        <div className="space-y-3 px-4 py-3 sm:px-5">
          {[...byArea.entries()].map(([area, list]) => (
            <div key={area}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{area}</p>
              <ul className="mt-1 space-y-1">
                {list.map((a) => {
                  const item = one(a.item as unknown as { name: string; photos: { url: string }[] } | null);
                  const fn = one(a.fn as unknown as { name: string } | null);
                  return (
                    <li key={a.id as string} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">{item?.photos?.[0]?.url ? <img src={item.photos[0].url} alt="" className="size-9 rounded-lg object-cover" /> : null}<span>{item?.name} × {a.quantity as number}{fn ? <span className="text-xs text-ink-soft"> · {fn.name}</span> : null}</span></span>
                      <Badge>{String(a.status).replace("_", " ")}</Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
