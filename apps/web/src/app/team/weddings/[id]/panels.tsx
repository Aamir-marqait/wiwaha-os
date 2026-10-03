import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST, rupees } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import type { createClient } from "@/lib/supabase/server";
import { chefConfirmMenu, finaliseMoodboard, setVendorStatus } from "./actions";
import { PostBox, RepriceForm } from "./panel-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Phase 3 panels for the staff Wedding Room: contract, quote, décor, menus, vendors, decisions. */
export async function PlanningPanels({ supabase, weddingId, role }: { supabase: Supa; weddingId: string; role: string }) {
  const [contracts, quotes, boards, menus, bookings, decisions, brief] = await Promise.all([
    supabase.from("contracts").select("id, version, status, sent_at, esign_url, esign_completed_at, signed_at").eq("wedding_id", weddingId).order("version", { ascending: false }),
    supabase.from("quotes").select("id, version, status, subtotal_paise, tax_paise, total_paise, valid_until, lines:quote_lines(id, description, quantity, unit_price_paise, line_total_paise, gst_rate_bps, off_book, sort)").eq("wedding_id", weddingId).order("version", { ascending: false }).limit(1),
    supabase.from("moodboards").select("id, round, theme, design_kind, status, palette, description, client_feedback, fn:event_functions(name)").eq("wedding_id", weddingId).in("status", ["shortlisted", "finalised", "approved"]).order("created_at"),
    supabase.from("menus").select("id, cuisine, status, plate_count, plate_count_lock_on, plate_count_locked_at, outside_caterer, tasting_status, fn:event_functions(name)").eq("wedding_id", weddingId).order("created_at"),
    supabase.from("vendor_bookings").select("id, status, chase_count, requested_at, replied_at, vendor:vendors(name, category)").eq("wedding_id", weddingId).order("requested_at"),
    supabase.from("wedding_decisions").select("id, topic, decision, decided_by_name, source, created_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }).limit(20),
    supabase.from("wedding_briefs").select("status, answers, submitted_at").eq("wedding_id", weddingId).maybeSingle(),
  ]);
  const contract = (contracts.data ?? [])[0];
  const quote = (quotes.data ?? [])[0] as { id: string; version: number; status: string; subtotal_paise: number; tax_paise: number; total_paise: number; valid_until: string | null; lines: { id: string; description: string; quantity: number; unit_price_paise: number; line_total_paise: number; gst_rate_bps: number; off_book: boolean; sort: number }[] } | undefined;
  const canDecor = role === "owner" || role === "event_manager";
  const answers = (brief.data?.answers ?? {}) as Record<string, unknown>;

  return (
    <>
      <Card>
        <CardHeader title="Contract" subtitle="Drafted from the policy book; Prashanth approves before e-signature." />
        <div className="px-4 py-3 text-sm sm:px-5">
          {contract ? (
            <>
              <p>Version {contract.version as number} · <Badge tone={contract.status === "signed" ? "solid" : contract.status === "pending_approval" ? "burgundy" : "gold"}>{String(contract.status).replace(/_/g, " ")}</Badge></p>
              {contract.sent_at ? <p className="mt-1 text-xs text-ink-soft">Sent {formatDateTimeIST(contract.sent_at as string)}{contract.esign_completed_at ? ` · signed ${formatDateTimeIST(contract.esign_completed_at as string)}` : ""}</p> : null}
              {contract.esign_url ? <p className="mt-1 text-xs"><a className="text-sage-700 underline" href={contract.esign_url as string} target="_blank" rel="noreferrer">Signing link</a></p> : null}
              {contract.status === "pending_approval" ? <p className="mt-1 text-xs"><a className="text-sage-700 underline" href="/team/approvals">Review in Approvals →</a></p> : null}
            </>
          ) : <p className="text-ink-soft">The Contract agent drafts this right after booking.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Brief" subtitle={brief.data ? `${String(brief.data.status)}${brief.data.submitted_at ? ` · ${formatDateIST(brief.data.submitted_at as string)}` : ""}` : "Not started"} />
        {brief.data ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2 sm:px-5">
            {(["cuisines", "veg_only", "outside_caterer", "rituals", "special_requests", "guest_rooms_needed"] as const).filter((k) => answers[k] !== undefined && answers[k] !== "").map((k) => (
              <div key={k}><dt className="text-xs capitalize text-ink-soft">{k.replace(/_/g, " ")}</dt><dd>{typeof answers[k] === "boolean" ? (answers[k] ? "Yes" : "No") : String(answers[k])}</dd></div>
            ))}
          </dl>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Menus" subtitle="Proposed by the Menu agent; the couple approves; the chef confirms." />
        <ul className="divide-y divide-line/70">
          {(menus.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Menus appear when the couple starts the Menus stage.</li> : null}
          {(menus.data ?? []).map((m) => (
            <li key={m.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-medium">{one(m.fn as unknown as { name: string } | null)?.name ?? "Function"}: {m.cuisine as string}</p>
                <p className="text-xs text-ink-soft">{(m.plate_count as number | null) ?? "?"} plates · lock {m.plate_count_lock_on ? formatDateIST(m.plate_count_lock_on as string) : "—"}{m.plate_count_locked_at ? " (locked)" : ""} · tasting {String(m.tasting_status ?? "—").replace(/_/g, " ")}</p>
              </div>
              <span className="flex flex-col items-end gap-1">
                <Badge tone={m.status === "chef_confirmed" ? "solid" : m.status === "client_approved" ? "gold" : "neutral"}>{String(m.status).replace(/_/g, " ")}</Badge>
                {m.status === "client_approved" && canDecor ? <ActionButton action={chefConfirmMenu.bind(null, weddingId, m.id as string)}>Chef confirmed</ActionButton> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Décor" subtitle="Shortlisted by the couple. Finalise; custom work goes to Prashanth." />
        <ul className="divide-y divide-line/70">
          {(boards.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing shortlisted yet.</li> : null}
          {(boards.data ?? []).map((b) => (
            <li key={b.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{one(b.fn as unknown as { name: string } | null)?.name}: {b.theme as string}</p>
                <p className="mt-1 flex gap-1">{((b.palette as string[] | null) ?? []).map((c) => <span key={c} className="size-4 rounded-full border border-line" style={{ background: c }} />)}</p>
                {b.client_feedback ? <p className="mt-1 text-xs italic text-ink-soft">&ldquo;{b.client_feedback as string}&rdquo;</p> : null}
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={b.design_kind === "custom" ? "burgundy" : "neutral"}>{b.design_kind as string}</Badge>
                <span className="text-xs text-ink-soft">{b.status as string}</span>
                {b.status === "shortlisted" && canDecor ? <ActionButton action={finaliseMoodboard.bind(null, weddingId, b.id as string)} variant="primary">Finalise</ActionButton> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Quote" subtitle={quote ? `v${quote.version} · ${String(quote.status).replace(/_/g, " ")}${quote.valid_until ? ` · valid until ${formatDateIST(quote.valid_until)}` : ""}` : "Prepared once menus and décor are final"} />
        {quote ? (
          <>
            <ul className="divide-y divide-line/70">
              {[...quote.lines].sort((a, b) => a.sort - b.sort).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                  <div className="min-w-0"><p>{l.description}</p><p className="text-xs text-ink-soft">{l.quantity} × {rupees(l.unit_price_paise)} · GST {l.gst_rate_bps / 100}%</p></div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular-nums">{rupees(l.line_total_paise)}</span>
                    {l.off_book ? <Badge tone="burgundy">needs price</Badge> : null}
                    {l.off_book && role === "owner" && quote.status === "pending_approval" ? <RepriceForm weddingId={weddingId} lineId={l.id} /> : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-0.5 border-t border-line px-4 py-3 text-right text-sm sm:px-5">
              <p className="text-ink-soft">Subtotal {rupees(quote.subtotal_paise)} · GST {rupees(quote.tax_paise)}</p>
              <p className="font-serif text-xl font-semibold">{rupees(quote.total_paise)}</p>
              <p className="text-xs text-ink-soft">Totals are recomputed from the lines when Prashanth approves.</p>
            </div>
          </>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Vendors" subtitle="Lock-in requests from the Vendor Coordinator" />
        <ul className="divide-y divide-line/70">
          {(bookings.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Requests go out once the quote is approved.</li> : null}
          {(bookings.data ?? []).map((b) => {
            const v = one(b.vendor as unknown as { name: string; category: string } | null);
            return (
              <li key={b.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
                <div><p className="text-sm font-medium">{v?.name}</p><p className="text-xs capitalize text-ink-soft">{v?.category} · asked {formatDateIST(b.requested_at as string)}{Number(b.chase_count) ? ` · chased ${b.chase_count as number}×` : ""}</p></div>
                <span className="flex flex-col items-end gap-1">
                  <Badge tone={b.status === "confirmed" ? "solid" : b.status === "declined" ? "burgundy" : "gold"}>{b.status as string}</Badge>
                  {b.status === "requested" && canDecor ? (
                    <span className="flex gap-1">
                      <ActionButton action={setVendorStatus.bind(null, weddingId, b.id as string, "confirmed")}>Confirmed</ActionButton>
                      <ActionButton action={setVendorStatus.bind(null, weddingId, b.id as string, "declined")} variant="ghost">Declined</ActionButton>
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Decisions" subtitle="Logged by the Wedding Room agent from the family group and portal chat" />
        <ul className="divide-y divide-line/70">
          {(decisions.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No decisions logged yet.</li> : null}
          {(decisions.data ?? []).map((d) => (
            <li key={d.id as string} className="px-4 py-3 sm:px-5">
              <p className="text-xs text-ink-soft"><span className="capitalize">{d.topic as string}</span> · {(d.decided_by_name as string | null) ?? "Family"} · {d.source as string} · {formatDateTimeIST(d.created_at as string)}</p>
              <p className="mt-1 text-sm">{d.decision as string}</p>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-3 sm:px-5"><PostBox weddingId={weddingId} /></div>
      </Card>
    </>
  );
}
