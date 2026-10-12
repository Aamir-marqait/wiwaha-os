import { Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { CopyField } from "@/components/copy-field";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Links" };

/**
 * The four ways into Wiwaha OS: Prashanth (management), team members, couples
 * and families, and wedding guests (add-on services).
 */
export default async function LinksPage() {
  const viewer = await requireStaff();
  const base = env.appUrl();
  const supabase = await createClient();
  const { data: weddings } = await supabase.from("weddings").select("id, title, event_start, guest_token").gte("event_end", todayIST()).neq("status", "cancelled").order("event_start");
  const owner = viewer.profile.role === "owner";
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Links" subtitle="Who signs in where. Everyone uses their own email; what they see depends on who they are." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="1. Founder: main management" subtitle="Prashanth signs in here and sees everything: approvals, costing, payments, access for every team member." />
          <div className="space-y-2 p-4"><CopyField label="Management login" value={`${base}/login`} /></div>
        </Card>
        <Card>
          <CardHeader title="2. Team members" subtitle="The same login. Each person only sees the headings Prashanth gives them." action={owner ? <Link href="/team/settings/team" className="text-sm text-sage-700 underline">Team & access</Link> : undefined} />
          <div className="space-y-2 p-4"><CopyField label="Team login" value={`${base}/login`} /><p className="text-xs text-ink-soft">New people get an email invite from Team & access; they set a password the first time.</p></div>
        </Card>
        <Card>
          <CardHeader title="3. Couples and families" subtitle="Their own portal: menus, décor, entertainment, extras, payments and ideas. Logins close after the wedding day." action={<Link href="/team/clients" className="text-sm text-sage-700 underline">Sign-in links</Link>} />
          <div className="space-y-2 p-4"><CopyField label="Client login" value={`${base}/portal/login`} /><p className="text-xs text-ink-soft">Each family member signs in with the email on their wedding. You can also send a one-time sign-in link on WhatsApp from Client portal.</p></div>
        </Card>
        <Card>
          <CardHeader title="4. Guests: additional services" subtitle="One public page per wedding: welcome, itinerary, the estate, and services like makeup and laundry to request. No login." />
          <div className="space-y-2 p-4">
            {(weddings ?? []).length === 0 ? <p className="text-sm text-ink-soft">No upcoming weddings.</p> : null}
            {(weddings ?? []).map((w) => <CopyField key={w.id as string} label={`${w.title as string} · ${formatDateIST(w.event_start as string, { day: "numeric", month: "short" })}`} value={`${base}/g/${w.guest_token as string}`} />)}
            <p className="text-xs text-ink-soft">Choose which services guests can request in Lists → Extras (“Guests can book”). Edit the welcome and share on WhatsApp from the wedding&rsquo;s Extras tab.</p>
          </div>
        </Card>
      </div>
      <p className="mt-5 text-xs text-ink-soft">Vendors don&rsquo;t sign in: each approved work order emails them a private link to accept or decline.</p>
    </>
  );
}
