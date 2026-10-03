import { Card, EmptyState, PageTitle, Badge } from "@wiwaha/ui";
import { daysBetween, formatDateIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Weddings" };

export default async function WeddingsPage() {
  const viewer = await requireStaff(["owner", "sales", "event_manager", "accounts"]);
  const supabase = await createClient();
  const { data } = await supabase.from("weddings").select("id, code, title, event_start, event_end, guest_count, stage, status, contract_value_paise, manager:profiles!weddings_event_manager_id_fkey(full_name)").order("event_start");
  const today = todayIST();
  return (
    <>
      <PageTitle title="Weddings" subtitle={viewer.profile.role === "event_manager" ? "The weddings assigned to you" : "Every booked celebration, each with its own Wedding Room"} />
      {(data ?? []).length === 0 ? <EmptyState title="No weddings yet">When a lead books, their Wedding Room appears here.</EmptyState> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((w) => {
            const m = (Array.isArray(w.manager) ? w.manager[0] : w.manager) as { full_name: string } | null;
            const days = daysBetween(today, w.event_start as string);
            return (
              <Link key={w.id as string} href={`/team/weddings/${w.id}`}>
                <Card className="h-full p-5 transition-shadow hover:shadow-lg">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-serif text-2xl font-semibold leading-tight">{w.title as string}</p>
                    <Badge tone={days < 0 ? "neutral" : days <= 30 ? "burgundy" : "sage"}>{days < 0 ? "Past" : `${days} days`}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{formatDateIST(w.event_start as string)} – {formatDateIST(w.event_end as string)}</p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="text-ink-soft">Guests</dt><dd className="text-sm">{(w.guest_count as number | null) ?? "—"}</dd></div>
                    <div><dt className="text-ink-soft">Stage</dt><dd className="text-sm capitalize">{String(w.stage).replace(/_/g, " ")}</dd></div>
                    <div><dt className="text-ink-soft">Value</dt><dd className="text-sm">{rupees(w.contract_value_paise as number | null, { compact: true })}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-ink-soft">{w.code as string} · {m?.full_name ?? "No event manager yet"}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
