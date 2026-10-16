import { formatDateIST, rupees } from "@wiwaha/db";
import { Badge, Card, CardHeader } from "@wiwaha/ui";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { DECOR_AREAS } from "@/lib/catalogue";
import type { createClient } from "@/lib/supabase/server";
import { setDecorExtraStatus } from "./extras-actions";
import { ExtraForm } from "./extras-form";

type Supa = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const EXTRA_STATUS: Record<string, { label: string; tone: "neutral" | "sage" | "gold" | "burgundy" | "solid" }> = {
  planned: { label: "Ordered", tone: "gold" }, received: { label: "Here", tone: "solid" }, returned: { label: "Returned", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Décor for this wedding: our own stock by area, what it costs to use, and anything rented or bought for it. */
export async function DecorStockCard({ supabase, weddingId, showMoney, canEdit }: { supabase: Supa; weddingId: string; showMoney: boolean; canEdit: boolean }) {
  const [{ data }, { data: extras }, { data: fns }, { data: stock }] = await Promise.all([
    supabase.from("decor_assignments").select("id, area, quantity, status, notes, item:decor_items(name, photos, use_cost_paise), fn:event_functions(name)").eq("wedding_id", weddingId).neq("status", "cancelled").order("area"),
    supabase.from("event_decor_extras").select("id, kind, name, quantity, unit_cost_paise, total_paise, supplier, status, return_by, area, fn:event_functions(name)").eq("wedding_id", weddingId).order("created_at"),
    supabase.from("event_functions").select("id, name").eq("wedding_id", weddingId).order("date"),
    canEdit ? supabase.from("decor_items").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const byArea = new Map<string, NonNullable<typeof data>>();
  for (const a of data ?? []) byArea.set(a.area as string, [...(byArea.get(a.area as string) ?? []), a]);
  const stockUse = (data ?? []).reduce((s, a) => s + Number(one(a.item as unknown as { use_cost_paise: number | null } | null)?.use_cost_paise ?? 0) * Number(a.quantity), 0);
  const live = (extras ?? []).filter((x) => x.status !== "cancelled");
  const rented = live.filter((x) => x.kind === "rented").reduce((s, x) => s + Number(x.total_paise), 0);
  const bought = live.filter((x) => x.kind === "purchased").reduce((s, x) => s + Number(x.total_paise), 0);
  return (
    <Card>
      <CardHeader title="Décor for this wedding" subtitle="Our stock by area, and anything rented or bought for it" action={<Link href="/team/decor" className="text-sm text-sage-700 underline">Assign from stock</Link>} />
      {showMoney ? (
        <dl className="grid grid-cols-3 gap-2 px-4 pb-3 text-sm sm:px-5">
          <div className="rounded-xl bg-ivory-50 p-2"><dt className="text-xs text-ink-soft">Our stock (use cost)</dt><dd className="font-medium">{rupees(stockUse)}</dd></div>
          <div className="rounded-xl bg-ivory-50 p-2"><dt className="text-xs text-ink-soft">Rented</dt><dd className="font-medium">{rupees(rented)}</dd></div>
          <div className="rounded-xl bg-ivory-50 p-2"><dt className="text-xs text-ink-soft">Bought</dt><dd className="font-medium">{rupees(bought)}</dd></div>
        </dl>
      ) : null}
      {byArea.size === 0 ? <p className="px-5 pb-3 text-sm text-ink-soft">Nothing assigned from our stock yet.</p> : (
        <div className="space-y-3 px-4 pb-3 sm:px-5">
          {[...byArea.entries()].map(([area, list]) => (
            <div key={area}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{area}</p>
              <ul className="mt-1 space-y-1">
                {list.map((a) => {
                  const item = one(a.item as unknown as { name: string; photos: { url: string }[]; use_cost_paise: number | null } | null);
                  const fn = one(a.fn as unknown as { name: string } | null);
                  return (
                    <li key={a.id as string} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">{item?.photos?.[0]?.url ? <img src={item.photos[0].url} alt="" className="size-9 rounded-lg object-cover" /> : null}<span>{item?.name} × {a.quantity as number}{fn ? <span className="text-xs text-ink-soft"> · {fn.name}</span> : null}{a.notes === "Bought for this event" ? <span className="text-xs text-ink-soft"> · bought for it</span> : null}</span></span>
                      <span className="flex shrink-0 items-center gap-1.5">{showMoney && item?.use_cost_paise ? <span className="text-xs text-ink-soft">{rupees(Number(item.use_cost_paise) * Number(a.quantity))}</span> : null}<Badge>{String(a.status).replace("_", " ")}</Badge></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Rented or bought for this event</p>
        {(extras ?? []).length === 0 ? <p className="text-sm text-ink-soft">Nothing yet.</p> : (
          <ul className="space-y-2">
            {(extras ?? []).map((x) => {
              const st = EXTRA_STATUS[x.status as string] ?? EXTRA_STATUS.planned!;
              const fn = one(x.fn as unknown as { name: string } | null);
              return (
                <li key={x.id as string} className={`text-sm ${x.status === "cancelled" ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p><span className="font-medium">{x.name as string}</span> × {x.quantity as number} <Badge tone={x.kind === "rented" ? "neutral" : "sage"}>{x.kind === "rented" ? "Rented" : "Bought"}</Badge> <Badge tone={st.tone}>{st.label}</Badge></p>
                    {showMoney ? <span className="font-medium">{rupees(Number(x.total_paise))}</span> : null}
                  </div>
                  <p className="text-xs text-ink-soft">{[x.supplier, fn?.name, x.area, x.kind === "rented" && x.return_by ? `back by ${formatDateIST(x.return_by as string, { day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ")}</p>
                  {canEdit && x.status !== "cancelled" && x.status !== "returned" ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {x.status === "planned" ? <ActionButton action={setDecorExtraStatus.bind(null, weddingId, x.id as string, "received")}>{x.kind === "purchased" ? "Arrived: add to stock" : "Arrived"}</ActionButton> : null}
                      {x.kind === "rented" && x.status === "received" ? <ActionButton action={setDecorExtraStatus.bind(null, weddingId, x.id as string, "returned")}>Sent back</ActionButton> : null}
                      {x.status === "planned" ? <ActionButton action={setDecorExtraStatus.bind(null, weddingId, x.id as string, "cancelled")} variant="ghost" confirm="Cancel this? Its cost comes off the wedding.">Cancel</ActionButton> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit ? <ExtraForm weddingId={weddingId} functions={(fns ?? []).map((f) => ({ id: f.id as string, name: f.name as string }))} stock={(stock ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))} areas={DECOR_AREAS} /> : null}
        {showMoney && live.length ? <p className="text-xs text-ink-soft">These costs count against this wedding&rsquo;s profit (Finance and Owner pages).</p> : null}
      </div>
    </Card>
  );
}
