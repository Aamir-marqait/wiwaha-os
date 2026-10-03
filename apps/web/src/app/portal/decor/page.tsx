import { Badge, Card } from "@wiwaha/ui";
import { loadPortal, stageOf } from "../_ui/load";
import { MoodboardActions } from "../_ui/forms";
import { PortalShell } from "../_ui/shell";
import { StageGate } from "../_ui/stage-gate";

export const metadata = { title: "Décor & moodboards" };

interface Board { id: string; round: number; theme: string; design_kind: string; status: string; palette: string[] | null; description: string | null; client_feedback: string | null; images: { prompt?: string; url?: string; alt?: string }[] | null; function_id: string; fn: { name: string } | { name: string }[] | null }

export default async function DecorPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const stage = await stageOf(supabase, w.id as string, "decor");
  if (!stage?.started_at) return <PortalShell t={t} wedding={w} first={first} active="decor"><StageGate t={t} stage={stage} /></PortalShell>;
  const { data } = await supabase.from("moodboards").select("id, round, theme, design_kind, status, palette, description, client_feedback, images, function_id, fn:event_functions(name)").eq("wedding_id", w.id).order("round").order("created_at");
  const boards = (data ?? []) as Board[];
  const byFn = new Map<string, Board[]>();
  for (const b of boards) byFn.set(b.function_id, [...(byFn.get(b.function_id) ?? []), b]);
  return (
    <PortalShell t={t} wedding={w} first={first} active="decor">
      <p className="text-sm text-ink-soft">About five broad themes per function first; shortlist what feels like you and we&rsquo;ll refine it into detail. <strong>Standard</strong> designs are from our in-house collection; <strong>Custom</strong> designs are bespoke and confirmed by Prashanth.</p>
      {boards.length === 0 ? <Card className="p-5 text-sm text-ink-soft">Your moodboards are being prepared.</Card> : null}
      {[...byFn.entries()].map(([fnId, list]) => {
        const name = (Array.isArray(list[0]!.fn) ? list[0]!.fn[0] : list[0]!.fn)?.name ?? "Function";
        return (
          <section key={fnId} className="space-y-3">
            <h2 className="font-serif text-2xl font-semibold">{name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.filter((b) => b.status !== "rejected").map((b) => (
                <Card key={b.id} className="overflow-hidden">
                  <div className="flex h-20">{(b.palette ?? []).map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
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
            </div>
          </section>
        );
      })}
    </PortalShell>
  );
}
