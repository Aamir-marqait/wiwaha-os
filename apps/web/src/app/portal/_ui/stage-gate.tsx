import { Card } from "@wiwaha/ui";
import { Lock } from "lucide-react";
import Link from "next/link";
import { UNLOCK_TEXT } from "@/components/stage-status";
import type { PortalDict } from "@/lib/i18n";

/** Shown in place of a tab whose stage hasn't been started (or is still locked by a payment). */
export function StageGate({ t, stage }: { t: PortalDict; stage: { status: string; started_at: string | null; unlock_rule: string; name: string } | null }) {
  const locked = stage?.status === "locked";
  return (
    <Card className="p-5 text-center">
      {locked ? <Lock className="mx-auto size-6 text-ink-soft" aria-hidden /> : null}
      <p className="mt-2 font-serif text-xl font-semibold">{stage?.name}</p>
      <p className="mt-1 text-sm text-ink-soft">{locked ? UNLOCK_TEXT[stage.unlock_rule] ?? t.locked_stage : t.stage_not_started}</p>
      <Link href="/portal" className="mt-3 inline-block text-sm text-sage-700 underline">{t.home} →</Link>
    </Card>
  );
}
