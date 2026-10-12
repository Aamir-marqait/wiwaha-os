import { Badge, Card } from "@wiwaha/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { chooseOption } from "../../actions";
import { loadPortal } from "../../_ui/load";
import { PortalShell } from "../../_ui/shell";

export const metadata: Metadata = { title: "Options" };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Entertainment or extras: pick only from what your event manager sent. */
export default async function OptionsPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  if (vertical !== "entertainment" && vertical !== "extras") notFound();
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const { data: rows } = await supabase.from("wedding_selections").select("id, name, description, image_url, status, staff_note, fn:event_functions(name)").eq("wedding_id", wedding!.id).eq("vertical", vertical).order("created_at");
  const canChoose = !!me?.can_approve;
  const label: Record<string, string> = { sent: "", chosen: t.chosen, declined: t.declined, final: t.final };
  return (
    <PortalShell t={t} wedding={wedding!} first={viewer.profile.full_name.split(" ")[0] ?? ""} active={vertical}>
      <div>
        <h2 className="font-serif text-2xl font-semibold">{vertical === "extras" ? t.extras : t.entertainment}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t.options_help}</p>
      </div>
      {(rows ?? []).length === 0 ? <Card className="p-5 text-sm text-ink-soft">Nothing here yet. Your event manager will send options when this stage opens.</Card> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {(rows ?? []).map((r) => {
          const fn = one(r.fn as unknown as { name: string } | null);
          const status = r.status as string;
          return (
            <li key={r.id as string}>
              <Card className="h-full overflow-hidden">
                {r.image_url ? <img src={r.image_url as string} alt="" className="h-40 w-full object-cover" /> : null}
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-serif text-xl font-semibold">{r.name as string}</p>
                    {label[status] ? <Badge tone={status === "declined" ? "neutral" : "sage"}>{label[status]}</Badge> : null}
                  </div>
                  {fn ? <p className="text-xs text-ink-soft">{fn.name}</p> : null}
                  {r.description ? <p className="text-sm">{r.description as string}</p> : null}
                  {r.staff_note ? <p className="text-sm italic text-ink-soft">{r.staff_note as string}</p> : null}
                  {canChoose && status !== "final" ? (
                    <div className="flex gap-2 pt-1">
                      {status !== "chosen" ? <ActionButton action={chooseOption.bind(null, r.id as string, "chosen", vertical)} variant="primary">{t.choose}</ActionButton> : null}
                      {status !== "declined" ? <ActionButton action={chooseOption.bind(null, r.id as string, "declined", vertical)} variant="ghost">{t.decline}</ActionButton> : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {!canChoose ? <p className="text-xs text-ink-soft">The couple makes these choices.</p> : null}
    </PortalShell>
  );
}
