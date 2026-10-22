import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewLeadForm } from "./new-lead-form";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const { data } = await (await createClient()).from("lead_sources").select("label").eq("active", true).order("sort");
  return (
    <>
      <Link href="/team/leads" className="text-sm text-sage-700 hover:underline">← Leads</Link>
      <PageTitle title="New lead" subtitle="For walk-ins, phone calls and referrals. If the phone number already exists, this attaches to the same family." />
      <Card className="max-w-2xl p-4 sm:p-6"><NewLeadForm heardOptions={(data ?? []).map((r) => r.label as string)} /></Card>
    </>
  );
}
