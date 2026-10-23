import { formatDateIST, formatDateTimeIST } from "@wiwaha/db";
import { parseDecorAnswers, summariseDecorAnswers, summariseFunctionAnswers } from "@wiwaha/agents";
import { Badge, Card, CardHeader, buttonClass } from "@wiwaha/ui";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import type { createClient } from "@/lib/supabase/server";
import { deleteMoodboard, makeMoodboardsNow, sendDecorQuestionnaire, shareMoodboards, startMoodboardsOver } from "./moodboard-actions";
import { DeckUpload, SlideActions } from "./moodboard-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
interface Slide { id: string; moodboard_id: string; area_name: string; element: string; caption: string | null; base_url: string | null; result_url: string | null; edited_url: string | null; engine: string; status: string; error: string | null; client_note: string | null; redo_count: number; sort: number }

const STATUS: Record<string, { label: string; tone: "solid" | "gold" | "burgundy" | "neutral" }> = {
  queued: { label: "Waiting", tone: "neutral" }, rendering: { label: "Making the picture…", tone: "gold" }, ready: { label: "Ready", tone: "solid" }, failed: { label: "Needs attention", tone: "burgundy" },
};

/** The décor questionnaire and the AI moodboards for one wedding (D40). */
export async function AiMoodboards({ supabase, weddingId, canEdit }: { supabase: Supa; weddingId: string; canEdit: boolean }) {
  const [brief, boards, fns, stage] = await Promise.all([
    supabase.from("decor_briefs").select("status, answers, sent_at, submitted_at, generated_at").eq("wedding_id", weddingId).maybeSingle(),
    supabase.from("moodboards").select("id, function_id, theme, description, design_kind, status, palette, shared_at, approval_id, deck_url, client_feedback, created_at").eq("wedding_id", weddingId).eq("source", "ai").order("created_at"),
    supabase.from("event_functions").select("id, name, date").eq("wedding_id", weddingId).order("date"),
    supabase.from("wedding_stages").select("status, started_at").eq("wedding_id", weddingId).eq("key", "decor").maybeSingle(),
  ]);
  const ids = (boards.data ?? []).map((b) => b.id as string);
  const { data: slideRows } = ids.length ? await supabase.from("moodboard_slides").select("id, moodboard_id, area_name, element, caption, base_url, result_url, edited_url, engine, status, error, client_note, redo_count, sort").in("moodboard_id", ids).order("sort") : { data: [] };
  const slides = (slideRows ?? []) as Slide[];
  const answers = parseDecorAnswers(brief.data?.answers ?? {});
  const summary = summariseDecorAnswers(answers);
  const fnName = new Map((fns.data ?? []).map((f) => [f.id as string, f.name as string]));
  const unshared = (boards.data ?? []).filter((b) => !b.shared_at);
  const busy = slides.some((s) => s.status === "queued" || s.status === "rendering");
  const status = brief.data?.status ?? null;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Décor questionnaire" subtitle={
          !brief.data ? (stage.data?.started_at ? "Décor is open; the questionnaire hasn't been sent yet." : "Opens with the décor stage (90 days before, once the advance is paid).")
            : status === "open" ? `Sent ${brief.data.sent_at ? formatDateTimeIST(brief.data.sent_at as string) : ""}. Waiting for the couple.`
              : `Sent back ${brief.data.submitted_at ? formatDateTimeIST(brief.data.submitted_at as string) : ""}${status === "generating" ? " · moodboards being made" : status === "ready" ? " · moodboards made" : ""}`
        } action={canEdit && stage.data?.started_at ? (
          <span className="flex flex-wrap justify-end gap-1.5">
            {!brief.data || status === "open" ? <ActionButton action={sendDecorQuestionnaire.bind(null, weddingId)}>{brief.data ? "Send reminder" : "Send questionnaire"}</ActionButton> : null}
            {status !== "generating" && !(boards.data ?? []).length ? <ActionButton action={makeMoodboardsNow.bind(null, weddingId)} variant="primary" pendingLabel="Starting…" confirm={summary.length ? undefined : "The couple hasn't answered yet. Make moodboards from the defaults?"}>Make moodboards now</ActionButton> : null}
            {unshared.length ? <ActionButton action={startMoodboardsOver.bind(null, weddingId)} confirm="Remove the boards the couple hasn't seen and reopen the questionnaire?">Start over</ActionButton> : null}
          </span>
        ) : undefined} />
        {summary.length ? (
          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-5">
            <ul className="space-y-1 text-sm">{summary.map((l) => <li key={l}>{l}</li>)}</ul>
            <ul className="space-y-2 text-sm">
              {(fns.data ?? []).map((f) => {
                const lines = summariseFunctionAnswers(answers.functions[f.id as string]);
                return lines.length ? <li key={f.id as string}><p className="font-medium">{f.name as string}</p><p className="text-ink-soft">{lines.join(" · ")}</p></li> : null;
              })}
            </ul>
          </div>
        ) : null}
      </Card>

      {(boards.data ?? []).length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-soft">{unshared.length ? `${unshared.length} moodboard${unshared.length === 1 ? "" : "s"} generated. The couple can't see ${unshared.length === 1 ? "it" : "them"} until you share ${unshared.length === 1 ? "it" : "them"}: look through, change what you need, upload a new PDF if you like, then share.` : "All moodboards are shared with the couple."} {busy ? "Pictures are still being made; this page updates when you reload it." : ""}</p>
          {canEdit && unshared.length ? <ActionButton action={shareMoodboards.bind(null, weddingId)} variant="primary" pendingLabel="Sharing…">Share to the couple portal</ActionButton> : null}
        </div>
      ) : null}

      {(boards.data ?? []).map((b) => {
        const mine = slides.filter((s) => s.moodboard_id === b.id);
        return (
          <Card key={b.id as string} className="overflow-hidden">
            <div className="flex h-2">{((b.palette ?? []) as string[]).map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
            <CardHeader
              title={<span>{fnName.get(b.function_id as string) ?? "Function"}: {b.theme as string}</span>}
              subtitle={<span className="flex flex-wrap items-center gap-1.5"><Badge tone={b.design_kind === "custom" ? "burgundy" : "neutral"}>{b.design_kind === "custom" ? "Custom" : "Standard"}</Badge><Badge tone={b.shared_at ? "solid" : "gold"}>{b.shared_at ? `Shared ${formatDateIST(b.shared_at as string, { day: "numeric", month: "short" })}` : "Not shared with the couple"}</Badge><span className="capitalize">{b.status as string}</span></span>}
              action={<span className="flex flex-wrap justify-end gap-1.5">
                <a href={`/api/moodboards/${b.id as string}/pdf`} className={buttonClass("secondary", "sm")}>Download PDF</a>
                {b.deck_url ? <a href={b.deck_url as string} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>Edited PDF</a> : null}
                {canEdit ? <DeckUpload weddingId={weddingId} moodboardId={b.id as string} current={(b.deck_url as string | null) ?? null} /> : null}
                {canEdit ? <ActionButton action={deleteMoodboard.bind(null, weddingId, b.id as string)} variant="ghost" confirm="Delete this moodboard and its pictures?">Delete</ActionButton> : null}
              </span>} />
            {b.description ? <p className="px-4 pb-2 text-sm text-ink-soft sm:px-5">{b.description as string}</p> : null}
            {b.client_feedback ? <p className="px-4 pb-2 text-sm italic sm:px-5">The couple said: &ldquo;{b.client_feedback as string}&rdquo;</p> : null}
            <ul className="divide-y divide-line/70">
              {mine.map((s) => {
                const st = STATUS[s.status] ?? STATUS.queued!;
                const shown = s.edited_url ?? s.result_url;
                return (
                  <li key={s.id} className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
                    <figure className="space-y-1">
                      <figcaption className="text-xs font-medium uppercase tracking-wide text-ink-soft">The space: {s.area_name}</figcaption>
                      {s.base_url ? <img src={s.base_url} alt={`${s.area_name} as it is`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /> : <div className="grid aspect-[4/3] place-items-center rounded-xl bg-ivory-100 p-3 text-center text-xs text-ink-soft">No plain photo. <Link href="/team/spaces" className="underline">Add one</Link></div>}
                    </figure>
                    <figure className="space-y-1">
                      <figcaption className="flex flex-wrap items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">{s.element} <Badge tone={st.tone}>{st.label}</Badge>{s.edited_url ? <Badge tone="gold">Edited</Badge> : s.engine === "reference" && s.result_url ? <Badge>Template photo</Badge> : s.result_url ? <Badge>AI preview</Badge> : null}</figcaption>
                      {shown ? <a href={shown} target="_blank" rel="noreferrer"><img src={shown} alt={s.element} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /></a> : <div className="grid aspect-[4/3] place-items-center rounded-xl bg-ivory-100 text-xs text-ink-soft">{s.status === "failed" ? "No picture" : "Being made…"}</div>}
                      {s.caption ? <p className="text-sm">{s.caption}</p> : null}
                      {s.error ? <p className="text-xs text-burgundy-700">{s.error}</p> : null}
                      {s.client_note ? <p className="text-xs italic">Couple: &ldquo;{s.client_note}&rdquo;</p> : null}
                      {canEdit ? <SlideActions weddingId={weddingId} slideId={s.id} edited={s.edited_url} canRedo={!!s.base_url} /> : null}
                    </figure>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
