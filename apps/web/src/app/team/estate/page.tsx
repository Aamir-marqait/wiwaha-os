import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, rupees, todayIST } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markPurchase } from "./actions";
import { ReadingForm, StockForm } from "./forms";

export const metadata = { title: "Estate" };

export default async function EstatePage() {
  const viewer = await requireStaff(["owner", "staff", "event_manager"]);
  const supabase = await createClient();
  const today = todayIST();
  const canEdit = viewer.profile.role !== "event_manager";
  const [schedules, items, purchases, readings, weddings] = await Promise.all([
    supabase.from("maintenance_schedules").select("*").eq("active", true).order("next_due_on"),
    supabase.from("inventory_items").select("*").order("category").order("name"),
    supabase.from("purchase_requests").select("*").in("status", ["requested", "pending_approval", "approved", "ordered"]).order("created_at", { ascending: false }),
    supabase.from("utility_readings").select("id, kind, reading, recorded_at, wedding:weddings(title)").order("recorded_at", { ascending: false }).limit(10),
    supabase.from("weddings").select("id, title").eq("status", "active").order("event_start"),
  ]);
  return (
    <>
      <PageTitle title="Estate" subtitle="The Estate agent raises maintenance tasks and low-stock purchase requests every morning." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Maintenance" subtitle="Garden, pool, AC, generator, pest control" />
          <ul className="divide-y divide-line/70">
            {(schedules.data ?? []).map((s) => {
              const late = s.next_due_on && (s.next_due_on as string) < today;
              return (
                <li key={s.id as string} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <div><p className="text-sm font-medium">{s.name as string}</p><p className="text-xs text-ink-soft">Every {s.frequency_days as number} days · last {s.last_done_on ? formatDateIST(s.last_done_on as string) : "—"}</p></div>
                  <Badge tone={late ? "burgundy" : "neutral"}>{s.next_due_on ? `due ${formatDateIST(s.next_due_on as string)}` : "unscheduled"}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Purchase requests" subtitle="Above the policy limit, Prashanth approves" />
          <ul className="divide-y divide-line/70">
            {(purchases.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing open.</li> : null}
            {(purchases.data ?? []).map((p) => (
              <li key={p.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
                <div><p className="text-sm font-medium">{p.item as string}{p.quantity ? ` × ${p.quantity as number}` : ""}</p><p className="text-xs text-ink-soft">{rupees(Number(p.amount_paise))} · {p.reason as string}</p></div>
                <span className="flex flex-col items-end gap-1">
                  <Badge tone={p.status === "pending_approval" ? "burgundy" : "gold"}>{String(p.status).replace(/_/g, " ")}</Badge>
                  {canEdit && ["requested", "approved"].includes(p.status as string) ? <ActionButton action={markPurchase.bind(null, p.id as string, "ordered")}>Ordered</ActionButton> : null}
                  {canEdit && p.status === "ordered" ? <ActionButton action={markPurchase.bind(null, p.id as string, "received")}>Received</ActionButton> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Inventory" subtitle="Furniture, linen, crockery, consumables" />
          <ul className="divide-y divide-line/70">
            {(items.data ?? []).map((i) => {
              const low = Number(i.quantity) <= Number(i.reorder_level);
              return (
                <li key={i.id as string} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0"><p className="text-sm font-medium">{i.name as string} {low ? <Badge tone="burgundy">low</Badge> : null}</p><p className="text-xs text-ink-soft">{i.quantity as number} {i.unit as string} · reorder at {i.reorder_level as number} · {(i.location as string | null) ?? ""}</p></div>
                  {canEdit ? <StockForm itemId={i.id as string} quantity={Number(i.quantity)} /> : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Utility and diesel readings" subtitle="Per event: start and end" />
          {canEdit ? <div className="px-4 py-3 sm:px-5"><ReadingForm weddings={(weddings.data ?? []).map((w) => ({ id: w.id as string, title: w.title as string }))} /></div> : null}
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {(readings.data ?? []).map((r) => {
              const w = (Array.isArray(r.wedding) ? r.wedding[0] : r.wedding) as { title: string } | null;
              return <li key={r.id as string} className="px-4 py-2 text-sm sm:px-5">{String(r.kind).replace("_", " ")}: <strong>{String(r.reading)}</strong> <span className="text-xs text-ink-soft">· {formatDateTimeIST(r.recorded_at as string)}{w ? ` · ${w.title}` : ""}</span></li>;
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
