import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { NewLeadForm } from "./new-lead-form";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await requireStaff(["owner", "sales"]);
  return (
    <>
      <Link href="/team/leads" className="text-sm text-sage-700 hover:underline">← Lead inbox</Link>
      <PageTitle title="New lead" subtitle="For walk-ins, phone calls and referrals. If the phone number already exists, this attaches to the same family." />
      <Card className="max-w-2xl p-4 sm:p-6"><NewLeadForm /></Card>
    </>
  );
}
