import { Badge, Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { channelStatus, type ChannelMode } from "@/lib/channels";

export const metadata = { title: "Connections" };

const MODE: Record<ChannelMode, { label: string; tone: "solid" | "gold" | "neutral" }> = {
  live: { label: "Live", tone: "solid" }, ready: { label: "Working", tone: "solid" }, manual: { label: "Manual for now", tone: "gold" }, sandbox: { label: "Test mode", tone: "neutral" },
};

/** Every outside dependency: what it does, whether it's connected, what it needs, and what happens until then. */
export default async function ChannelsPage() {
  await requireStaff();
  const channels = channelStatus();
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Connections" subtitle="Nothing here blocks the team. Where a connection isn't live yet, there is a manual way to do the same job." />
      <div className="grid gap-4 lg:grid-cols-2">
        {channels.map((c) => (
          <Card key={c.key} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-serif text-xl font-semibold">{c.name}</p><p className="text-sm text-ink-soft">{c.purpose}</p></div>
              <Badge tone={MODE[c.mode].tone}>{MODE[c.mode].label}</Badge>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-xs uppercase tracking-wide text-ink-soft">To connect</dt><dd>{c.needs} <span className="text-ink-soft">({c.leadTime})</span></dd></div>
              {c.envKeys.length ? <div><dt className="text-xs uppercase tracking-wide text-ink-soft">Settings (in Vercel)</dt><dd className="font-mono text-xs">{c.envKeys.join(", ")}</dd></div> : null}
              {c.mode !== "live" && c.mode !== "ready" ? <div><dt className="text-xs uppercase tracking-wide text-ink-soft">Until then</dt><dd>{c.fallback}</dd></div> : null}
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
