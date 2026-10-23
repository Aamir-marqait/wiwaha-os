import { buttonClass, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { addDays, formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { CopyField } from "@/components/copy-field";
import { requireSection } from "@/lib/auth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CreateLogin, MemberActions } from "../weddings/[id]/portal-access-forms";
import { extendPortal } from "./actions";

export const metadata = { title: "Client portal" };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
type Member = { id: string; display_name: string; member_role: string; user_id: string | null; login_phone: string | null };

/** One login per couple: create it, then copy the message with the link, number and PIN. */
export default async function ClientsPage() {
  await requireSection("client");
  const supabase = await createClient();
  const today = todayIST();
  const [{ data: weddings }, { data: access }] = await Promise.all([
    supabase.from("weddings")
      .select("id, title, event_start, event_end, portal_access_until, primary_contact:contacts!weddings_primary_contact_id_fkey(full_name, phone_e164), members:wedding_members(id, display_name, member_role, user_id, login_phone)")
      .gte("event_end", addDays(today, -30)).order("event_start"),
    supabase.from("policies").select("value").eq("key", "portal.access").maybeSingle(),
  ]);
  const closeDays = Number((access?.value as { close_days_after_event?: number } | null)?.close_days_after_event ?? 0);
  const loginUrl = `${env.appUrl()}/portal/login`;

  return (
    <>
      <PageTitle title="Client portal" subtitle="One login for each couple. Create it, then copy the message with the link, mobile number and PIN and send it to them. It stays open until the wedding is over." />
      <div className="mb-4 max-w-xl"><CopyField label="Portal link" value={loginUrl} /></div>
      {(weddings ?? []).length === 0 ? <Card className="p-5 text-sm text-ink-soft">No upcoming weddings.</Card> : null}
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
        {(weddings ?? []).map((w) => {
          const until = (w.portal_access_until as string | null) ?? addDays(w.event_end as string, closeDays);
          const closed = until < today;
          const members = (w.members ?? []) as Member[];
          const shared = members.find((m) => m.login_phone && m.member_role === "couple") ?? members.find((m) => m.login_phone);
          const contact = one(w.primary_contact as { full_name: string; phone_e164: string | null } | { full_name: string; phone_e164: string | null }[] | null);
          const couple = w.title as string;
          return (
            <Card key={w.id as string}>
              <CardHeader title={<Link href={`/team/weddings/${w.id as string}`} className="hover:underline">{couple}</Link>} subtitle={`${formatDateIST(w.event_start as string)} · ${closed ? `closed after ${formatDateIST(until)}` : `open until the end of ${formatDateIST(until)}`}`}
                action={<ActionButton action={extendPortal.bind(null, w.id as string, 7)} variant="ghost">{closed ? "Reopen 7 days" : "Keep open 7 more days"}</ActionButton>} />
              <div className="space-y-2 px-4 py-3 sm:px-5">
                {shared ? (
                  <>
                    <p className="text-sm">Mobile <strong>{shared.login_phone}</strong> <span className="text-xs text-ink-soft">· {shared.user_id ? "login ready" : "invited"}</span></p>
                    <MemberActions memberId={shared.id} couple={couple} phone />
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-soft">{contact?.phone_e164 ? `No login yet. Uses ${contact.full_name}'s number ${contact.phone_e164}.` : "No login yet."}</p>
                    {contact?.phone_e164
                      ? <CreateLogin weddingId={w.id as string} couple={couple} label="Create login" preset={{ name: contact.full_name, phone: contact.phone_e164, role: "couple" }} />
                      : <Link href={`/team/weddings/${w.id as string}#portal`} className={buttonClass("secondary", "sm")}>Create login</Link>}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
