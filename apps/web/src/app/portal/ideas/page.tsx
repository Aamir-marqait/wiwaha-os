import { Badge, Card } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import type { Metadata } from "next";
import { loadPortal } from "../_ui/load";
import { PortalShell } from "../_ui/shell";
import { IdeaForm } from "./idea-form";

export const metadata: Metadata = { title: "Ideas" };

/** Before planning opens: share ideas, and see that each one was noted. */
export default async function IdeasPage() {
  const { viewer, supabase, t, wedding } = await loadPortal();
  const { data: ideas } = await supabase.from("wedding_ideas").select("id, author_name, body, link_url, noted_at, created_at").eq("wedding_id", wedding!.id).order("created_at", { ascending: false });
  return (
    <PortalShell t={t} wedding={wedding!} first={viewer.profile.full_name.split(" ")[0] ?? ""} active="ideas">
      <Card className="p-4 sm:p-5">
        <h2 className="font-serif text-2xl font-semibold">{t.ideas}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">{t.ideas_help}</p>
        <IdeaForm weddingId={wedding!.id as string} labels={{ idea: "Your idea", link: "A link or picture (optional)", about: "It's about", share: "Share idea", areas: { "": "Anything", decor: t.decor, fnb: "Food", entertainment: t.entertainment, extras: t.extras, venue: "Venue and rooms", other: "Something else" } }} />
      </Card>
      <ul className="space-y-3">
        {(ideas ?? []).map((i) => (
          <li key={i.id as string}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-ink-soft">{(i.author_name as string | null) ?? ""} · {formatDateTimeIST(i.created_at as string)}</p>
                <Badge tone={i.noted_at ? "sage" : "neutral"}>{i.noted_at ? "Noted by your team" : "Received"}</Badge>
              </div>
              <p className="mt-1 whitespace-pre-line text-[15px]">{i.body as string}</p>
              {i.link_url ? <a href={i.link_url as string} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm text-sage-700 underline">{i.link_url as string}</a> : null}
            </Card>
          </li>
        ))}
      </ul>
    </PortalShell>
  );
}
