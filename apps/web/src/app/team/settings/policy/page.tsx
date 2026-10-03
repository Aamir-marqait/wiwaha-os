import { Badge, Card, PageTitle } from "@wiwaha/ui";
import { formatDateIST } from "@wiwaha/db";
import { NON_NEGOTIABLE_KEYS, type PolicyKey } from "@wiwaha/policy";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Policy book" };

export default async function PolicyBookPage() {
  const viewer = await requireStaff();
  const owner = viewer.profile.role === "owner";
  const supabase = await createClient();
  const { data } = await supabase.from("policies").select("key, topic, title, rule_text, version, needs_confirmation, client_visible, updated_at, sort").order("sort");
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const p of data ?? []) groups.set(p.topic as string, [...(groups.get(p.topic as string) ?? []), p]);

  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle
        title="Policy book"
        subtitle="The single source of truth. Agents answer only from these rules; anything not covered is escalated to a person."
      />
      {(data ?? []).some((p) => p.needs_confirmation) ? (
        <p className="mb-5 rounded-xl bg-gold-50 px-4 py-3 text-sm text-gold-700 ring-1 ring-gold-200">Some rules still have details waiting for Prashanth&rsquo;s confirmation (open questions in the PRD). Agents escalate instead of guessing until they&rsquo;re confirmed.</p>
      ) : null}
      <div className="space-y-8">
        {[...groups.entries()].map(([topic, rows]) => (
          <section key={topic}>
            <h2 className="mb-3 font-serif text-2xl font-semibold text-sage-800">{topic}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((p) => (
                <Link key={p.key as string} href={`/team/settings/policy/${p.key}`}>
                  <Card className="h-full p-4 transition-shadow hover:shadow-lg">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{p.title as string}</p>
                      {NON_NEGOTIABLE_KEYS.includes(p.key as PolicyKey) ? <Badge tone="sage">House rule</Badge> : null}
                      {p.needs_confirmation ? <Badge tone="gold">Needs confirmation</Badge> : null}
                      {p.client_visible ? <Badge>Visible to couples</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-ink">{p.rule_text as string}</p>
                    <p className="mt-2 text-xs text-ink-soft">v{p.version as number} · updated {formatDateIST(p.updated_at as string)}{owner ? " · tap to edit" : ""}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
