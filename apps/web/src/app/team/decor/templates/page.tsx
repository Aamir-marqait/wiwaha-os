import { Badge, Card, PageTitle, buttonClass } from "@wiwaha/ui";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DecorTabs } from "../tabs";

export const metadata = { title: "Décor templates" };

/** Sample moodboards saved area by area; the Design agent starts each couple's boards from these. */
export default async function DecorTemplatesPage() {
  const viewer = await requireSection("decor");
  const canEdit = ["owner", "event_manager"].includes(viewer.profile.role);
  const supabase = await createClient();
  const { data } = await supabase.from("decor_templates").select("*").order("area").order("sort").order("title");
  const byArea = new Map<string, NonNullable<typeof data>>();
  for (const t of data ?? []) byArea.set(t.area as string, [...(byArea.get(t.area as string) ?? []), t]);
  return (
    <>
      <PageTitle title="Décor" subtitle="Templates by area: how each spot looks, and what we've done there. Moodboards start from these." action={canEdit ? <Link href="/team/catalogue/decor_templates" className={buttonClass("primary", "sm")}>Add or edit templates</Link> : undefined} />
      <DecorTabs active="templates" />
      {byArea.size === 0 ? <Card className="p-5 text-sm text-ink-soft">No templates yet. Add one per area: main door entry, lobby, staircase, mandap and so on.</Card> : null}
      <div className="space-y-6">
        {[...byArea.entries()].map(([area, list]) => (
          <section key={area}>
            <h2 className="mb-2 font-serif text-2xl font-semibold">{area}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((t) => {
                const photos = [...((t.examples ?? []) as { url: string }[]).map((e) => e.url), ...(t.reference_image_url ? [t.reference_image_url as string] : [])];
                return (
                  <li key={t.id as string}>
                    <Card className={`h-full overflow-hidden ${t.active ? "" : "opacity-60"}`}>
                      {photos.length ? <div className="grid h-36 grid-cols-3 gap-0.5">{photos.slice(0, 3).map((u) => <img key={u} src={u} alt="" className="size-full object-cover" />)}</div> : null}
                      <div className="space-y-1 p-4">
                        <div className="flex items-start justify-between gap-2"><p className="font-medium">{t.title as string}</p><Badge tone={t.design_kind === "custom" ? "burgundy" : "neutral"}>{t.design_kind as string}</Badge></div>
                        {t.function_type ? <p className="text-xs capitalize text-ink-soft">{t.function_type as string}</p> : null}
                        {t.description ? <p className="text-sm">{t.description as string}</p> : null}
                        {((t.palette ?? []) as string[]).length ? <p className="flex gap-1 pt-1">{((t.palette ?? []) as string[]).map((c) => <span key={c} className="size-4 rounded-full border border-line" style={{ background: c }} />)}</p> : null}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
