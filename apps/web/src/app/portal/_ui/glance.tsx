import { Card, cn } from "@wiwaha/ui";
import type { PortalDict } from "@/lib/i18n";
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Bucket = "waiting" | "chosen" | "final";
interface Item { label: string; href: string }
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/**
 * The couple's dashboard: everything sent to them, grouped as waiting for
 * them, chosen or approved by them, and confirmed (final). Menus, décor,
 * entertainment, extras and the quote, in one place.
 */
export async function AtAGlance({ supabase, weddingId, t }: { supabase: Supa; weddingId: string; t: PortalDict }) {
  const [menus, boards, picks, quotes] = await Promise.all([
    supabase.from("menus").select("cuisine, status, fn:event_functions(name)").eq("wedding_id", weddingId).neq("status", "draft"),
    supabase.from("moodboards").select("theme, status, round, fn:event_functions(name)").eq("wedding_id", weddingId).neq("status", "rejected"),
    supabase.from("wedding_selections").select("name, vertical, status").eq("wedding_id", weddingId).neq("status", "declined"),
    supabase.from("quotes").select("version, status").eq("wedding_id", weddingId).in("status", ["sent", "client_approved"]).order("version", { ascending: false }).limit(1),
  ]);
  const out: Record<Bucket, Item[]> = { waiting: [], chosen: [], final: [] };
  for (const m of menus.data ?? []) {
    const b: Bucket = m.status === "proposed" ? "waiting" : m.status === "client_approved" ? "chosen" : "final";
    out[b].push({ label: `${t.menus}: ${one(m.fn as unknown as { name: string } | null)?.name ?? ""} · ${m.cuisine as string}`, href: "/portal/menus" });
  }
  const generated = (boards.data ?? []).filter((b) => b.status === "generated");
  if (generated.length) out.waiting.push({ label: `${t.decor}: ${generated.length} moodboard${generated.length === 1 ? "" : "s"} to look at`, href: "/portal/decor" });
  for (const b of (boards.data ?? []).filter((x) => x.status !== "generated")) {
    out[b.status === "shortlisted" ? "chosen" : "final"].push({ label: `${t.decor}: ${one(b.fn as unknown as { name: string } | null)?.name ?? ""} · ${b.theme as string}`, href: "/portal/decor" });
  }
  for (const s of picks.data ?? []) {
    const label = `${s.vertical === "extras" ? t.extras : t.entertainment}: ${s.name as string}`;
    const href = `/portal/options/${s.vertical as string}`;
    out[s.status === "sent" ? "waiting" : s.status === "chosen" ? "chosen" : "final"].push({ label, href });
  }
  const q = (quotes.data ?? [])[0];
  if (q) out[q.status === "sent" ? "waiting" : "final"].push({ label: `${t.quote} v${q.version as number}`, href: "/portal/quote" });

  const cols: { key: Bucket; title: string; tone: string }[] = [
    { key: "waiting", title: "Waiting for you", tone: "border-gold-400" },
    { key: "chosen", title: "You've chosen", tone: "border-sage-400" },
    { key: "final", title: "Confirmed", tone: "border-sage-700" },
  ];
  if (!out.waiting.length && !out.chosen.length && !out.final.length) return null;
  return (
    <section>
      <h2 className="mb-2 font-serif text-2xl font-semibold">At a glance</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {cols.map((c) => (
          <Card key={c.key} className={cn("border-t-4 p-4", c.tone)}>
            <p className="text-sm font-medium">{c.title} <span className="text-ink-soft">({out[c.key].length})</span></p>
            <ul className="mt-2 space-y-1.5">
              {out[c.key].length === 0 ? <li className="text-sm text-ink-soft">Nothing here yet.</li> : null}
              {out[c.key].slice(0, 8).map((i, n) => <li key={n}><a href={i.href} className="text-sm text-sage-800 hover:underline">{i.label}</a></li>)}
              {out[c.key].length > 8 ? <li className="text-xs text-ink-soft">and {out[c.key].length - 8} more</li> : null}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
