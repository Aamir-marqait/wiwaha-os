import { formatDateIST, formatDateTimeIST } from "@wiwaha/db";
import { reelWordBudget } from "@wiwaha/agents";
import { PolicyBook } from "@wiwaha/policy";
import { Badge, Card, CardHeader, PageTitle, buttonClass } from "@wiwaha/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { CopyField } from "@/components/copy-field";
import { agentDeps } from "@/lib/agents";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { checkRenders } from "../actions";
import { FORMAT_LABELS, STATUS_LABELS, StudioTabs } from "../tabs";
import { AutoRefresh, ScriptEditor, SlideEdit } from "./item-forms";

export const metadata = { title: "Script" };

export default async function StudioItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const { data: item } = await supabase.from("studio_items").select("*").eq("id", id).maybeSingle();
  if (!item) notFound();
  const [{ data: renders }, { data: photos }, rows] = await Promise.all([
    supabase.from("studio_renders").select("id, kind, idx, spec, status, result_url, edits, error").eq("item_id", id).order("kind").order("idx"),
    supabase.from("media_assets").select("id, url").eq("kind", "image").eq("status", "ready").order("created_at", { ascending: false }).limit(60),
    agentDeps().store.loadPolicyRows(),
  ]);
  const rules = PolicyBook.fromRows(rows).get("studio.content");
  const status = item.status as string;
  const st = STATUS_LABELS[status] ?? STATUS_LABELS.draft!;
  const format = item.content_type as string;
  const out = (item.outputs ?? {}) as { slides?: string[]; video_url?: string; poster_url?: string; seconds?: number; silent?: boolean; music?: boolean };
  const progress = (item.progress ?? {}) as { stage?: string; done?: number; total?: number };
  const options = (item.options ?? {}) as { seconds?: number };
  const slides = (renders ?? []).filter((r) => r.kind === "slide");
  const shots = (renders ?? []).filter((r) => r.kind === "shot");
  const busy = ["drafting", "approved", "generating"].includes(status);
  const budget = format === "reel" ? reelWordBudget(options.seconds ?? 30, rules.words_per_second) : null;
  const captionText = [item.caption as string | null, ((item.hashtags ?? []) as string[]).join(" ")].filter(Boolean).join("\n\n");
  return (
    <>
      {busy ? <AutoRefresh /> : null}
      {status === "generating" ? <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">Rendering. This page updates by itself. <ActionButton action={checkRenders} pendingLabel="Checking…">Check now</ActionButton></div> : null}
      <PageTitle title={item.title as string} subtitle={<span className="flex flex-wrap items-center gap-1.5"><Badge tone={st.tone}>{st.label}</Badge><Badge>{FORMAT_LABELS[format]}</Badge>{item.scheduled_for ? <span>Post on {formatDateIST(item.scheduled_for as string, { weekday: "short", day: "numeric", month: "short" })}</span> : null}{item.pillar ? <span>· {item.pillar as string}</span> : null}</span>} />
      <StudioTabs active="scripts" />
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-4 sm:p-5">
          {item.brief ? <p className="mb-3 text-sm text-ink-soft">Brief: {item.brief as string}</p> : null}
          <ScriptEditor id={id} status={status} format={format} wordsHint={budget ? `about ${budget.words} for ${options.seconds ?? 30} seconds` : null}
            initial={{ title: item.title as string, hook: (item.hook as string | null) ?? "", script: (item.script as string | null) ?? "", caption: (item.caption as string | null) ?? "", hashtags: ((item.hashtags ?? []) as string[]).join(" ") }} />
          <p className="mt-4 text-xs text-ink-soft">Created {formatDateTimeIST(item.created_at as string)}{(item.change_count as number) ? ` · ${item.change_count as number} change${item.change_count === 1 ? "" : "s"} requested` : ""}</p>
        </Card>
        <div className="space-y-5">
          {busy && status !== "drafting" ? (
            <Card className="p-4 text-sm">
              <p className="font-medium">Rendering{progress.stage ? `: ${progress.stage}` : "…"}</p>
              {progress.total ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-ivory-200"><div className="h-full bg-sage-600" style={{ width: `${Math.round(((progress.done ?? 0) / progress.total) * 100)}%` }} /></div> : null}
              <p className="mt-2 text-ink-soft">This page updates by itself. Reels take a few minutes.</p>
            </Card>
          ) : null}
          {item.error ? <Card className="border-burgundy-200 bg-burgundy-50 p-4 text-sm text-burgundy-800">{item.error as string}</Card> : null}
          {out.video_url ? (
            <Card className="overflow-hidden">
              <video src={out.video_url} poster={out.poster_url} controls playsInline className="mx-auto max-h-[70vh] w-full bg-ink object-contain" />
              <div className="flex flex-wrap items-center gap-2 p-4">
                <a href={out.video_url} download className={buttonClass("primary", "sm")}>Download reel</a>
                <span className="text-xs text-ink-soft">{out.seconds ? `${out.seconds}s` : ""}{out.silent ? " · no voice (add FAL_KEY for voiceovers)" : ""}{out.music ? " · with music" : ""}</span>
              </div>
            </Card>
          ) : null}
          {slides.length ? (
            <Card>
              <CardHeader title={format === "carousel" ? "Slides" : "Image"} action={out.slides?.length ? <a href={`/api/studio/${id}/download`} className={buttonClass("primary", "sm")}>Download {format === "carousel" ? "all (.zip)" : "(.zip)"}</a> : undefined} />
              <ul className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-3">
                {slides.map((r) => {
                  const spec = (r.spec ?? {}) as { headline?: string; support?: string | null; kicker?: string | null; asset_id?: string | null };
                  return (
                    <li key={r.id as string} className="space-y-1.5">
                      {r.result_url ? <a href={r.result_url as string} target="_blank" rel="noreferrer"><img src={r.result_url as string} alt={spec.headline ?? ""} className="w-full rounded-lg border border-line" /></a> : <div className="grid aspect-[4/5] place-items-center rounded-lg bg-ivory-100 text-xs text-ink-soft">{r.status === "failed" ? "Couldn't make this slide" : "Setting…"}</div>}
                      {r.error ? <p className="text-xs text-burgundy-700">{r.error as string}</p> : null}
                      {r.status === "ready" ? <SlideEdit itemId={id} idx={r.idx as number} edits={r.edits as number} limit={rules.slide_edits_per_slide} photos={(photos ?? []).map((p) => ({ id: p.id as string, url: p.url as string }))} initial={{ headline: spec.headline ?? "", support: spec.support ?? "", kicker: spec.kicker ?? "", assetId: spec.asset_id ?? null }} /> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
          {shots.length && !out.video_url ? (
            <Card className="p-4 text-sm">
              <p className="font-medium">Shots: {shots.filter((s) => s.status === "ready").length} of {shots.length} ready</p>
              <p className="text-ink-soft">{shots.filter((s) => s.status === "failed").length ? `${shots.filter((s) => s.status === "failed").length} couldn't be made and will be covered by the shot before.` : ""}</p>
            </Card>
          ) : null}
          {captionText && status === "generated" ? (
            <Card className="p-4">
              <p className="mb-2 text-sm font-medium">Caption to paste</p>
              <CopyField value={captionText} label="Copy caption" />
              <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{captionText}</p>
            </Card>
          ) : null}
          <p className="text-xs text-ink-soft"><Link href="/team/studio" className="underline">← All scripts</Link></p>
        </div>
      </div>
    </>
  );
}
