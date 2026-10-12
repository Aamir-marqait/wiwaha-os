import { Card, CardHeader, cn } from "@wiwaha/ui";
import { addDays, formatDateIST, todayIST } from "@wiwaha/db";
import { Check } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
type State = "done" | "now" | "later";
interface Step { label: string; state: State; note?: string }

/**
 * The wedding's place in the agreed flow: enquiry → visit and tour → advance →
 * welcome and contract → WhatsApp group → planning opens (T-90) → options →
 * the couple's choices → Prashanth's costing → the couple's consent → vendor
 * work orders → the event → review.
 */
export async function Lifecycle({ supabase, w }: { supabase: Supa; w: { id: string; lead_id: string | null; event_start: string; event_end: string; whatsapp_group_url: string | null } }) {
  const today = todayIST();
  const [visits, payments, contracts, groupTask, menus, boards, selections, quotes, bookings, reviews, planning] = await Promise.all([
    w.lead_id ? supabase.from("visits").select("id", { count: "exact", head: true }).eq("lead_id", w.lead_id).eq("status", "completed") : Promise.resolve({ count: 0 }),
    supabase.from("payments").select("status, effect").eq("wedding_id", w.id),
    supabase.from("contracts").select("status").eq("wedding_id", w.id),
    supabase.from("tasks").select("status").eq("wedding_id", w.id).eq("title", "Create the family WhatsApp group").maybeSingle(),
    supabase.from("menus").select("status").eq("wedding_id", w.id),
    supabase.from("moodboards").select("status").eq("wedding_id", w.id),
    supabase.from("wedding_selections").select("status").eq("wedding_id", w.id),
    supabase.from("quotes").select("status").eq("wedding_id", w.id).order("version", { ascending: false }).limit(1),
    supabase.from("vendor_bookings").select("status").eq("wedding_id", w.id),
    supabase.from("reviews").select("submitted_at").eq("wedding_id", w.id),
    supabase.from("policies").select("value").eq("key", "planning.start").maybeSingle(),
  ]);
  const days = Number((planning.data?.value as { recommended_days_before?: number } | null)?.recommended_days_before ?? 90);
  const opens = addDays(w.event_start, -days);
  const advance = (payments.data ?? []).some((p) => p.status === "paid" && p.effect === "holds_date");
  const contract = (contracts.data ?? []).some((c) => ["sent", "signed"].includes(c.status as string));
  const signed = (contracts.data ?? []).some((c) => c.status === "signed");
  const group = !!w.whatsapp_group_url || groupTask.data?.status === "done";
  const sent = (menus.data ?? []).length > 0 || (boards.data ?? []).length > 0 || (selections.data ?? []).some((s) => s.status !== "draft");
  const choices = (menus.data ?? []).some((m) => ["client_approved", "chef_confirmed"].includes(m.status as string))
    || (boards.data ?? []).some((b) => ["shortlisted", "finalised", "approved"].includes(b.status as string))
    || (selections.data ?? []).some((s) => ["chosen", "final"].includes(s.status as string));
  const quote = (quotes.data ?? [])[0]?.status as string | undefined;
  const costed = quote === "sent" || quote === "client_approved";
  const consent = quote === "client_approved";
  const orders = (bookings.data ?? []).filter((b) => b.status === "confirmed").length;
  const over = w.event_end < today;
  const reviewed = (reviews.data ?? []).some((r) => r.submitted_at);

  const flags: [string, boolean, string?][] = [
    ["Enquiry", true],
    ["Site visit and tour", (visits.count ?? 0) > 0 || advance, (visits.count ?? 0) ? undefined : "No visit recorded"],
    ["Advance paid: date held", advance],
    ["Welcome and contract", contract, signed ? "Signed" : contract ? "Sent for signing" : undefined],
    ["Family WhatsApp group", group],
    ["Planning opens", today >= opens, formatDateIST(opens)],
    ["Options sent: menus, décor, entertainment, extras", sent],
    ["The couple's choices", choices],
    ["Prashanth's costing", costed],
    ["The couple's final consent", consent],
    ["Vendor work orders", orders > 0, orders ? `${orders} confirmed` : undefined],
    ["The event", over, `${formatDateIST(w.event_start)}`],
    ["Review", reviewed],
  ];
  const firstOpen = flags.findIndex(([, ok]) => !ok);
  const steps: Step[] = flags.map(([label, ok, note], i) => ({ label, note, state: ok ? "done" : i === firstOpen ? "now" : "later" }));

  return (
    <Card>
      <CardHeader title="Where this wedding is" subtitle="The agreed flow, from enquiry to review" />
      <ol className="grid gap-1 px-4 py-3 sm:grid-cols-2 sm:px-5">
        {steps.map((s, i) => (
          <li key={s.label} className={cn("flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm", s.state === "now" && "bg-gold-100")}>
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold", s.state === "done" ? "bg-sage-700 text-white" : s.state === "now" ? "bg-gold-500 text-ink" : "bg-ivory-200 text-ink-soft")}>
              {s.state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn(s.state === "later" && "text-ink-soft")}>{s.label}{s.note ? <span className="block text-xs text-ink-soft">{s.note}</span> : null}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
