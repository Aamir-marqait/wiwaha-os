import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { addDays, formatDateIST, formatDateTimeIST } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import type { createClient } from "@/lib/supabase/server";
import { finaliseSelection, noteIdea, withdrawSelection } from "./actions";
import { GroupLinkForm, OptionsPicker } from "./vertical-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const TONE: Record<string, "sage" | "gold" | "burgundy" | "neutral" | "solid"> = { draft: "neutral", sent: "gold", chosen: "sage", declined: "burgundy", final: "solid" };
const LABEL: Record<string, string> = { draft: "draft", sent: "waiting for the couple", chosen: "chosen by the couple", declined: "declined", final: "final" };

/** Entertainment or extras: what was sent, what the couple chose, and sending more. */
export async function SelectionsPanel({ supabase, weddingId, vertical, canEdit }: { supabase: Supa; weddingId: string; vertical: "entertainment" | "extras"; canEdit: boolean }) {
  const [rows, options, fns] = await Promise.all([
    supabase.from("wedding_selections").select("id, name, status, staff_note, client_note, sent_at, chosen_at, fn:event_functions(name)").eq("wedding_id", weddingId).eq("vertical", vertical).order("created_at"),
    canEdit ? supabase.from("service_options").select("id, name, category").eq("vertical", vertical).eq("active", true).order("sort").order("name") : Promise.resolve({ data: [] }),
    canEdit ? supabase.from("event_functions").select("id, name").eq("wedding_id", weddingId).order("date") : Promise.resolve({ data: [] }),
  ]);
  const title = vertical === "extras" ? "Add-on services" : "Entertainment";
  return (
    <Card>
      <CardHeader title={title} subtitle={vertical === "extras" ? "Makeup, laundry, welcome drinks and more, assigned to this wedding by the team" : "Artists and acts assigned to this wedding by the team"} />
      <ul className="divide-y divide-line/70">
        {(rows.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing assigned yet.</li> : null}
        {(rows.data ?? []).map((r) => (
          <li key={r.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.name as string}{one(r.fn as unknown as { name: string } | null)?.name ? <span className="font-normal text-ink-soft"> · {one(r.fn as unknown as { name: string } | null)!.name}</span> : null}</p>
              <p className="text-xs text-ink-soft">{r.sent_at ? `sent ${formatDateIST(r.sent_at as string)}` : ""}{r.chosen_at ? ` · answered ${formatDateTimeIST(r.chosen_at as string)}` : ""}</p>
              {r.client_note ? <p className="mt-1 text-xs italic">&ldquo;{r.client_note as string}&rdquo;</p> : null}
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Badge tone={TONE[r.status as string] ?? "neutral"}>{r.status === "final" ? "assigned" : (LABEL[r.status as string] ?? (r.status as string))}</Badge>
              {canEdit && r.status === "chosen" ? <ActionButton action={finaliseSelection.bind(null, weddingId, r.id as string)} variant="primary">Make final</ActionButton> : null}
              {canEdit ? <ActionButton action={withdrawSelection.bind(null, weddingId, r.id as string)} variant="ghost" confirm="Remove this from the wedding?">Remove</ActionButton> : null}
            </span>
          </li>
        ))}
      </ul>
      {canEdit ? <div className="border-t border-line/70 px-4 py-3 sm:px-5"><OptionsPicker weddingId={weddingId} vertical={vertical} options={(options.data ?? []) as { id: string; name: string; category: string }[]} functions={(fns.data ?? []) as { id: string; name: string }[]} /></div> : null}
    </Card>
  );
}

/** Ideas the family shared before planning opened. */
export async function IdeasPanel({ supabase, weddingId, eventStart, canNote }: { supabase: Supa; weddingId: string; eventStart: string; canNote: boolean }) {
  const [ideas, planning] = await Promise.all([
    supabase.from("wedding_ideas").select("id, author_name, body, link_url, vertical, noted_at, created_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }).limit(50),
    supabase.from("policies").select("value").eq("key", "planning.start").maybeSingle(),
  ]);
  const days = Number((planning.data?.value as { recommended_days_before?: number } | null)?.recommended_days_before ?? 90);
  return (
    <Card>
      <CardHeader title="Ideas from the family" subtitle={`Shared in the portal. Planning opens ${formatDateIST(addDays(eventStart, -days))}; until then we note them.`} />
      <ul className="divide-y divide-line/70">
        {(ideas.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No ideas shared yet.</li> : null}
        {(ideas.data ?? []).map((i) => (
          <li key={i.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs text-ink-soft">{(i.author_name as string | null) ?? "Family"} · {formatDateTimeIST(i.created_at as string)}{i.vertical ? ` · ${String(i.vertical).replace("fnb", "food")}` : ""}</p>
              <p className="mt-1 whitespace-pre-line text-sm">{i.body as string}</p>
              {i.link_url ? <a href={i.link_url as string} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs text-sage-700 underline">{i.link_url as string}</a> : null}
            </div>
            {i.noted_at ? <Badge tone="sage">Noted</Badge> : canNote ? <ActionButton action={noteIdea.bind(null, weddingId, i.id as string)}>Noted</ActionButton> : <Badge>new</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The family WhatsApp group: made by the event manager after the advance. */
export function GroupCard({ weddingId, url, canEdit }: { weddingId: string; url: string | null; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader title="Family WhatsApp group" subtitle="Made by the event manager once the advance is paid. Ideas posted there before planning opens just get a “noted”." />
      <div className="space-y-2 px-4 py-3 text-sm sm:px-5">
        {url ? <a href={url} target="_blank" rel="noreferrer" className="break-all text-sage-700 underline">{url}</a> : <p className="text-ink-soft">No group link saved yet.</p>}
        {canEdit ? <GroupLinkForm weddingId={weddingId} current={url} /> : null}
      </div>
    </Card>
  );
}
