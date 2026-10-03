import { Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PolicyForm } from "./policy-form";

export const metadata = { title: "Edit rule" };

export default async function PolicyEditPage({ params }: { params: Promise<{ key: string }> }) {
  const viewer = await requireStaff();
  const { key } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("policies").select("*").eq("key", key).maybeSingle();
  if (!p) notFound();
  const { data: versions } = await supabase.from("policy_versions").select("version, rule_text, change_note, changed_at, changer:profiles(full_name)").eq("policy_key", key).order("version", { ascending: false });

  return (
    <>
      <Link href="/team/settings/policy" className="text-sm text-sage-700 hover:underline">← Policy book</Link>
      <PageTitle title={p.title as string} subtitle={`${p.topic as string} · ${key} · version ${p.version as number}`} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4 sm:p-6">
          <PolicyForm policyKey={key} ruleText={p.rule_text as string} value={JSON.stringify(p.value, null, 2)} needsConfirmation={p.needs_confirmation as boolean} canEdit={viewer.profile.role === "owner"} />
        </Card>
        <Card>
          <CardHeader title="Version history" />
          <ol className="divide-y divide-line/70">
            {(versions ?? []).map((v) => {
              const who = (Array.isArray(v.changer) ? v.changer[0] : v.changer) as { full_name: string } | null;
              return (
                <li key={v.version as number} className="px-4 py-3">
                  <p className="text-xs text-ink-soft">v{v.version as number} · {formatDateTimeIST(v.changed_at as string)} · {who?.full_name ?? "Seed"}</p>
                  <p className="mt-1 text-sm">{v.rule_text as string}</p>
                  {v.change_note ? <p className="mt-1 text-xs italic text-ink-soft">“{v.change_note as string}”</p> : null}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}
