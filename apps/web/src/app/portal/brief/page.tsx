import { Card } from "@wiwaha/ui";
import { BriefForm } from "../_ui/forms";
import { loadPortal, stageOf } from "../_ui/load";
import { PortalShell } from "../_ui/shell";
import { StageGate } from "../_ui/stage-gate";

export const metadata = { title: "Your brief" };

export default async function BriefPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const stage = await stageOf(supabase, w.id as string, "brief");
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  if (!stage?.started_at) return <PortalShell t={t} wedding={w} first={first} active="brief"><StageGate t={t} stage={stage} /></PortalShell>;
  const [{ data: fns }, { data: brief }] = await Promise.all([
    supabase.from("event_functions").select("id, type, name, date, start_time, end_time, guest_count, rituals").eq("wedding_id", w.id).order("date").order("start_time"),
    supabase.from("wedding_briefs").select("answers, status").eq("wedding_id", w.id).maybeSingle(),
  ]);
  const editable = !!me?.can_edit_brief && brief?.status !== "reviewed";
  return (
    <PortalShell t={t} wedding={w} first={first} active="brief">
      <Card className="p-4 sm:p-5">
        <h2 className="font-serif text-2xl font-semibold">Tell us about your celebration</h2>
        <p className="mt-1 text-sm text-ink-soft">Save as you go. When you&rsquo;re happy, send it to your event manager; they&rsquo;ll fill any gaps with you.{brief?.status === "submitted" ? " (Sent: you can still make changes and send again.)" : brief?.status === "reviewed" ? " Your event manager has reviewed this brief." : ""}</p>
        <div className="mt-4">
          <BriefForm
            weddingId={w.id as string}
            eventStart={w.event_start as string}
            editable={editable}
            labels={{ save: t.save, saving: t.saving, submit: t.submit }}
            initialAnswers={(brief?.answers ?? {}) as Record<string, string | boolean>}
            initialFunctions={(fns ?? []).map((f) => ({ id: f.id as string, type: f.type as string, name: f.name as string, date: f.date as string, start_time: f.start_time ? String(f.start_time).slice(0, 5) : "", end_time: f.end_time ? String(f.end_time).slice(0, 5) : "", guest_count: f.guest_count ? String(f.guest_count) : "", rituals: (f.rituals as string | null) ?? "" }))}
          />
        </div>
      </Card>
    </PortalShell>
  );
}
