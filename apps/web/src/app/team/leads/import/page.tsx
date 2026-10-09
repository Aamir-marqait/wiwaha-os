import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import leads" };

export default async function ImportLeadsPage() {
  await requireStaff(["owner", "sales"]);
  return (
    <>
      <Link href="/team/leads" className="text-sm text-sage-700 hover:underline">← Leads</Link>
      <PageTitle title="Import leads" subtitle="Until Meta and Google are connected directly, export your leads and upload the file here." />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-4 sm:p-5"><ImportForm /></Card>
        <Card className="p-4 text-sm sm:p-5">
          <h2 className="font-serif text-xl font-semibold">Where to get the file</h2>
          <ul className="mt-2 space-y-3 text-ink-soft">
            <li><strong className="text-ink">Meta:</strong> Meta Business Suite → Leads Center → select your form → <em>Download leads</em> (CSV).</li>
            <li><strong className="text-ink">Google Ads:</strong> Campaigns → Assets → Lead forms → <em>Download leads</em>.</li>
            <li><strong className="text-ink">A spreadsheet:</strong> any sheet with a name and a phone or email column. Headers like Full name, Phone number, Email, City, Event date, Guests and Notes are recognised.</li>
          </ul>
          <p className="mt-3 text-xs text-ink-soft">Each lead is de-duplicated by phone, tagged with its source, scored, and a reply is drafted for your approval. Uploading the same file twice never creates duplicates.</p>
        </Card>
      </div>
    </>
  );
}
