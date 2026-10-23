import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateIST } from "@wiwaha/db";
import Link from "next/link";
import { relativeFromNow } from "@/components/time";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Moodboards created" };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Where every couple's moodboards are: waiting for their answers, being made, or made and shared. */
export default async function MoodboardsCreatedPage() {
  await requireSection("decor");
  const supabase = await createClient();
  const [briefs, boards] = await Promise.all([
    supabase.from("decor_briefs").select("wedding_id, status, sent_at, submitted_at, generated_at, wedding:weddings(title, event_start)").order("updated_at", { ascending: false }),
    supabase.from("moodboards").select("id, wedding_id, theme, shared_at, status, function:event_functions(name)").eq("source", "ai").order("created_at"),
  ]);
  const byWedding = new Map<string, NonNullable<typeof boards.data>>();
  for (const b of boards.data ?? []) byWedding.set(b.wedding_id as string, [...(byWedding.get(b.wedding_id as string) ?? []), b]);
  const rows = briefs.data ?? [];
  return (
    <>
      <PageTitle title="Moodboards created" subtitle="Every couple's moodboards: waiting for their answers, made and ready for you to review, or shared with them." />
      <Card>
        <CardHeader title="Moodboards created" subtitle="Made from the couple's décor form, then shared with them from the Wedding Room (Décor tab)" />
        <ul className="divide-y divide-line/70">
          {rows.length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No décor forms yet. They appear once a couple's décor stage is open.</li> : null}
          {rows.map((r) => {
            const w = one(r.wedding as { title: string; event_start: string } | { title: string; event_start: string }[] | null);
            const mine = byWedding.get(r.wedding_id as string) ?? [];
            const unshared = mine.filter((b) => !b.shared_at).length;
            const state = r.status === "open" ? { text: "Waiting for the couple", tone: "neutral" as const }
              : r.status !== "ready" ? { text: "Being made", tone: "gold" as const }
              : unshared ? { text: "Generated, not shared yet", tone: "burgundy" as const }
              : { text: "Shared with the couple", tone: "sage" as const };
            return (
              <li key={r.wedding_id as string}>
                <Link href={`/team/weddings/${r.wedding_id as string}?tab=decor&from=moodboards`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-ivory-50 sm:px-5">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{w?.title ?? "Wedding"}</span>
                    <span className="block text-xs text-ink-soft">
                      {w ? `${formatDateIST(w.event_start, { day: "numeric", month: "short", year: "numeric" })} · ` : ""}
                      {mine.length ? `${mine.length} board${mine.length === 1 ? "" : "s"}: ${mine.map((b) => `${one(b.function as { name: string } | { name: string }[] | null)?.name ?? "Function"}: ${b.theme as string}`).join(" · ")}` : "No boards yet"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2"><Badge tone={state.tone}>{state.text}</Badge>{r.generated_at ?? r.submitted_at ?? r.sent_at ? <span className="text-xs text-ink-soft">{relativeFromNow((r.generated_at ?? r.submitted_at ?? r.sent_at) as string)}</span> : null}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
