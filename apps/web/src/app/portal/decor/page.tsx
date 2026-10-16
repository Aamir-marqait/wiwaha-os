import {
  ELEMENTS, FEELS, FLOWERS, LIGHTING, MANDAP_STYLES, MOODS, PALETTES, SEATING, STYLES, TRADITIONS, parseDecorAnswers,
} from "@wiwaha/agents";
import { formatDateIST } from "@wiwaha/db";
import { Badge, Card, buttonClass } from "@wiwaha/ui";
import { loadPortal, stageOf } from "../_ui/load";
import { MoodboardActions } from "../_ui/forms";
import { PortalShell } from "../_ui/shell";
import { StageGate } from "../_ui/stage-gate";
import { DecorQuestionnaire, SlideNote, type Answers } from "./questionnaire";

export const metadata = { title: "Décor & moodboards" };

interface Board { id: string; round: number; theme: string; design_kind: string; status: string; palette: string[] | null; description: string | null; client_feedback: string | null; images: { prompt?: string; url?: string; alt?: string }[] | null; function_id: string; source: string; deck_url: string | null; fn: { name: string } | { name: string }[] | null }
interface Slide { id: string; moodboard_id: string; area_name: string; element: string; caption: string | null; base_url: string | null; result_url: string | null; edited_url: string | null; engine: string; status: string; client_note: string | null; redo_count: number }

export default async function DecorPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const stage = await stageOf(supabase, w.id as string, "decor");
  if (!stage?.started_at) return <PortalShell t={t} wedding={w} first={first} active="decor"><StageGate t={t} stage={stage} /></PortalShell>;
  const [{ data: brief }, { data }, { data: fns }, { data: areas }, { data: photos }, { data: policy }] = await Promise.all([
    supabase.from("decor_briefs").select("status, answers").eq("wedding_id", w.id).maybeSingle(),
    supabase.from("moodboards").select("id, round, theme, design_kind, status, palette, description, client_feedback, images, function_id, source, deck_url, fn:event_functions(name)").eq("wedding_id", w.id).order("round").order("created_at"),
    supabase.from("event_functions").select("id, name, type, date").eq("wedding_id", w.id).order("date"),
    supabase.from("venue_areas").select("id, name, description").eq("active", true).order("sort"),
    supabase.from("media_assets").select("url, venue_area_id, is_primary").eq("look", "plain"),
    supabase.from("policies").select("value").eq("key", "decor.ai_moodboards").maybeSingle(),
  ]);
  const boards = (data ?? []) as Board[];
  const aiIds = boards.filter((b) => b.source === "ai").map((b) => b.id);
  const { data: slideRows } = aiIds.length ? await supabase.from("moodboard_slides").select("id, moodboard_id, area_name, element, caption, base_url, result_url, edited_url, engine, status, client_note, redo_count").in("moodboard_id", aiIds).order("sort") : { data: [] };
  const slides = (slideRows ?? []) as Slide[];
  const redos = Number((policy?.value as { redos_per_slide?: number } | null)?.redos_per_slide ?? 3);
  const answers = parseDecorAnswers(brief?.answers ?? {});
  const editable = !!me?.can_edit_brief && (!brief || brief.status === "open");
  const photoFor = (areaId: string) => (photos ?? []).filter((p) => p.venue_area_id === areaId).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.url as string | undefined;
  const byFn = new Map<string, Board[]>();
  for (const b of boards) byFn.set(b.function_id, [...(byFn.get(b.function_id) ?? []), b]);
  const showQuestionnaire = !brief || brief.status === "open";
  return (
    <PortalShell t={t} wedding={w} first={first} active="decor">
      {showQuestionnaire ? (
        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold">{t.decor_q_title}</h2>
            <p className="text-sm text-ink-soft">{t.decor_q_help}</p>
          </div>
          <DecorQuestionnaire
            weddingId={w.id as string}
            initial={answers as unknown as Answers}
            editable={editable}
            choices={{ traditions: [...TRADITIONS], styles: [...STYLES], palettes: PALETTES.map((p) => ({ ...p, hex: [...p.hex] })), flowers: [...FLOWERS], elements: [...ELEMENTS], mandaps: [...MANDAP_STYLES], moods: [...MOODS], seating: [...SEATING], lighting: [...LIGHTING], feels: [...FEELS] }}
            areas={(areas ?? []).map((a) => ({ id: a.id as string, name: a.name as string, description: (a.description as string | null) ?? null, photo: photoFor(a.id as string) ?? null }))}
            functions={(fns ?? []).map((f) => ({ id: f.id as string, name: f.name as string, type: f.type as string, dateLabel: formatDateIST(f.date as string, { weekday: "short", day: "numeric", month: "short" }) }))}
            labels={{ save: t.save, saving: t.saving, send: t.decor_q_send, sending: t.decor_q_sending }}
          />
          {!me?.can_edit_brief ? <p className="text-sm text-ink-soft">The couple fills this in; you can see their answers here.</p> : null}
        </section>
      ) : boards.length === 0 || (aiIds.length === 0 && brief?.status !== "ready") ? (
        <Card className="p-5 text-sm">{t.decor_preparing}</Card>
      ) : null}

      {boards.length ? <p className="text-sm text-ink-soft">Each space at Wiwaha as it is, next to how it could look for you. Shortlist what feels like you, or ask for a change on any picture. <strong>Standard</strong> designs are from our in-house collection; <strong>Custom</strong> designs are made for you and confirmed by Prashanth.</p> : null}
      {[...byFn.entries()].map(([fnId, list]) => {
        const name = (Array.isArray(list[0]!.fn) ? list[0]!.fn[0] : list[0]!.fn)?.name ?? "Function";
        return (
          <section key={fnId} className="space-y-3">
            <h2 className="font-serif text-2xl font-semibold">{name}</h2>
            {list.filter((b) => b.status !== "rejected").map((b) => b.source === "ai" ? (
              <Card key={b.id} className="overflow-hidden">
                <div className="flex h-3">{(b.palette ?? []).map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
                <div className="flex flex-wrap items-start justify-between gap-2 p-4">
                  <div>
                    <p className="font-serif text-xl font-semibold">{b.theme}</p>
                    {b.description ? <p className="text-sm text-ink-soft">{b.description}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={b.design_kind === "custom" ? "burgundy" : "neutral"}>{b.design_kind === "custom" ? t.custom : t.standard}</Badge>
                    <a href={b.deck_url ?? `/api/moodboards/${b.id}/pdf`} className={buttonClass("secondary", "sm")}>{t.download_pdf}</a>
                  </div>
                </div>
                <ul className="divide-y divide-line/70">
                  {slides.filter((s) => s.moodboard_id === b.id && s.status === "ready").map((s) => (
                    <li key={s.id} className="space-y-2 p-4">
                      <p className="text-sm font-medium uppercase tracking-wide">{s.element} <span className="font-normal normal-case text-ink-soft">· {s.area_name}</span></p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <figure>
                          {s.base_url ? <img src={s.base_url} alt={`${s.area_name} as it is`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /> : <div className="grid aspect-[4/3] place-items-center rounded-xl bg-ivory-100 text-xs text-ink-soft">—</div>}
                          <figcaption className="mt-1 text-xs text-ink-soft">{t.as_it_is}</figcaption>
                        </figure>
                        <figure>
                          {s.edited_url ?? s.result_url ? <img src={(s.edited_url ?? s.result_url)!} alt={s.element} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /> : null}
                          <figcaption className="mt-1 text-xs text-ink-soft">{t.could_look}{s.engine === "ai" && !s.edited_url ? ` · ${t.ai_preview}` : ""}</figcaption>
                        </figure>
                      </div>
                      {s.caption ? <p className="text-sm">{s.caption}</p> : null}
                      {me?.can_approve && ["generated", "shortlisted"].includes(b.status) ? <SlideNote slideId={s.id} current={s.client_note} remaining={Math.max(0, redos - Number(s.redo_count ?? 0))} labels={{ ask: t.ask_change, send: t.send, sent: t.change_sent }} /> : null}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2 border-t border-line p-4">
                  {b.client_feedback ? <p className="text-xs italic text-ink-soft">You said: &ldquo;{b.client_feedback}&rdquo;</p> : null}
                  <p className="text-xs text-ink-soft capitalize">{b.status}</p>
                  {me?.can_approve && ["generated", "shortlisted"].includes(b.status) ? <MoodboardActions id={b.id} shortlisted={b.status === "shortlisted"} labels={{ shortlist: t.shortlist, not_for_us: t.not_for_us }} /> : null}
                </div>
              </Card>
            ) : (
              <Card key={b.id} className="overflow-hidden">
                {(() => {
                  const imgs = (b.images ?? []).map((i) => i.url).filter((u): u is string => !!u).slice(0, 3);
                  return imgs.length ? <div className={`grid h-36 gap-0.5 ${imgs.length === 1 ? "grid-cols-1" : imgs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>{imgs.map((u) => <img key={u} src={u} alt="" className="size-full object-cover" />)}</div> : null;
                })()}
                <div className="flex h-5">{(b.palette ?? []).map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-serif text-lg font-semibold">{b.theme}</p>
                    <Badge tone={b.design_kind === "custom" ? "burgundy" : "neutral"}>{b.design_kind === "custom" ? t.custom : t.standard}</Badge>
                  </div>
                  <p className="text-xs text-ink-soft">{b.round === 1 ? "Broad theme" : "Detail"} · {b.status}</p>
                  {b.description ? <p className="text-sm">{b.description}</p> : null}
                  {b.client_feedback ? <p className="text-xs italic text-ink-soft">You said: &ldquo;{b.client_feedback}&rdquo;</p> : null}
                  {me?.can_approve && ["generated", "shortlisted"].includes(b.status) ? <MoodboardActions id={b.id} shortlisted={b.status === "shortlisted"} labels={{ shortlist: t.shortlist, not_for_us: t.not_for_us }} /> : null}
                </div>
              </Card>
            ))}
          </section>
        );
      })}
    </PortalShell>
  );
}
