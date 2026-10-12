import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewWeddingForm } from "./new-wedding-form";

export const metadata = { title: "New wedding" };

export default async function NewWeddingPage() {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient();
  const { data: people } = await supabase.from("profiles").select("id, full_name, role").in("role", ["event_manager", "owner"]).eq("active", true).order("role").order("full_name");
  return (
    <>
      <Link href="/team/weddings" className="text-sm text-sage-700 hover:underline">← Weddings</Link>
      <PageTitle title="New wedding" subtitle="For a booking that didn't come in as a lead: a walk-in, a phone call or a referral. Enquiries that are already leads are booked from the lead page." />
      <Card className="max-w-3xl p-4 sm:p-6"><NewWeddingForm managers={(people ?? []).sort((a, b) => (a.role === "event_manager" ? -1 : 1) - (b.role === "event_manager" ? -1 : 1)).map((p) => ({ id: p.id as string, name: p.full_name as string }))} /></Card>
    </>
  );
}
