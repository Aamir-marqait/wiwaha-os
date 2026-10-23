import { cn } from "@wiwaha/ui";
import Link from "next/link";

const TABS = [
  { href: "/team/studio", key: "quick", label: "Quick create" },
  { href: "/team/studio/calendar", key: "calendar", label: "Calendar" },
  { href: "/team/studio/content", key: "content", label: "Content" },
  { href: "/team/studio/library", key: "library", label: "Library" },
  { href: "/team/studio/brand", key: "brand", label: "Brand" },
] as const;

export function StudioTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Studio" className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5">
        {TABS.map((t) => (
          <li key={t.key} className="shrink-0">
            <Link href={t.href} aria-current={t.key === active ? "page" : undefined} className={cn("block rounded-full px-3 py-1.5 text-sm", t.key === active ? "bg-sage-700 font-medium text-white" : "bg-ivory-200 text-ink hover:bg-ivory-100")}>{t.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export const FORMAT_LABELS: Record<string, string> = { carousel: "Carousel", single_post: "Single post", story: "Story", reel: "Reel" };
export const STATUS_LABELS: Record<string, { label: string; tone: "solid" | "gold" | "burgundy" | "neutral" }> = {
  drafting: { label: "Writing…", tone: "neutral" }, draft: { label: "To approve", tone: "gold" }, approved: { label: "Queued", tone: "neutral" },
  generating: { label: "Rendering…", tone: "gold" }, generated: { label: "Ready", tone: "solid" }, failed: { label: "Needs attention", tone: "burgundy" }, discarded: { label: "Discarded", tone: "neutral" },
};

/** One quiet line: renders left this month and whether AI pictures, voice and music are on. */
export function StudioStatus({ used, allowance, low, live }: { used: number; allowance: number; low: boolean; live: boolean }) {
  return (
    <p className={cn("mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2 text-xs ring-1", low ? "bg-gold-50 text-ink ring-gold-300" : "bg-white text-ink-soft ring-line")}>
      <span><b className="font-medium text-ink">{used}</b> of {allowance} renders used this month{low ? " · running low" : ""}</span>
      <span>{live ? "AI pictures, voice and music on" : "Offline mode: your photos, captions, no voice (add FAL_KEY to switch on AI)"}</span>
    </p>
  );
}
