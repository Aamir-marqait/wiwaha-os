import { Badge, Card, CardHeader, PageTitle, buttonClass } from "@wiwaha/ui";
import Link from "next/link";
import { addDays, formatDateIST, rupees, todayIST } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deletePurchase, markMaintenanceDone, markPurchase } from "./actions";

export const metadata = { title: "Estate" };

export default async function EstatePage() {
  const viewer = await requireSection("venue", ["owner", "staff", "event_manager"]);
  const supabase = await createClient();
  const today = todayIST();
  const canEdit = viewer.profile.role !== "event_manager";
  const [schedules, purchases] = await Promise.all([
    supabase.from("maintenance_schedules").select("*").eq("active", true).order("next_due_on"),
    supabase.from("purchase_requests").select("*").in("status", ["requested", "pending_approval", "approved", "ordered"]).order("created_at", { ascending: false }),
  ]);
  const week = addDays(today, 7);
  const sched = schedules.data ?? [];
  const overdue = sched.filter((s) => s.next_due_on && (s.next_due_on as string) < today).length;
  const dueWeek = sched.filter((s) => s.next_due_on && (s.next_due_on as string) >= today && (s.next_due_on as string) <= week).length;
  const open = (purchases.data ?? []).length;
  const tiles: [string, number, boolean][] = [["Overdue", overdue, overdue > 0], ["Due this week", dueWeek, false], ["Purchases open", open, false]];
  return (
    <>
      <PageTitle title="Estate upkeep" subtitle="Recurring maintenance for the estate, and what needs buying." action={canEdit ? <Link href="/team/catalogue/maintenance" className={buttonClass("secondary", "sm")}>Add or edit maintenance</Link> : undefined} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([l, n, alert]) => <Card key={l} className={`p-4 ${alert ? "ring-1 ring-burgundy-300" : ""}`}><p className="text-xs uppercase tracking-wide text-ink-soft">{l}</p><p className={`text-2xl font-semibold ${alert ? "text-burgundy-700" : ""}`}>{n}</p></Card>)}
      </div>
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader title="Maintenance" subtitle="Garden, pool, AC, generator, pest control" />
          <ul className="divide-y divide-line/70">
            {(schedules.data ?? []).map((s) => {
              const late = s.next_due_on && (s.next_due_on as string) < today;
              return (
                <li key={s.id as string} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <div><p className="text-sm font-medium">{s.name as string}</p><p className="text-xs text-ink-soft">Every {s.frequency_days as number} days · last {s.last_done_on ? formatDateIST(s.last_done_on as string) : "—"}</p></div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={late ? "burgundy" : "neutral"}>{s.next_due_on ? `${late ? "was due" : "due"} ${formatDateIST(s.next_due_on as string)}` : "unscheduled"}</Badge>
                    {canEdit ? <ActionButton action={markMaintenanceDone.bind(null, s.id as string)} variant="ghost">Done today</ActionButton> : null}
                  </span>
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
                  {canEdit ? <ActionButton action={deletePurchase.bind(null, p.id as string)} variant="ghost" confirm="Delete this purchase request?">Delete</ActionButton> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>

      </div>
    </>
  );
}
