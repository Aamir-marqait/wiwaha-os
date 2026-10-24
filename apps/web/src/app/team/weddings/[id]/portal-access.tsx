import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { CopyField } from "@/components/copy-field";
import { env } from "@/lib/env";
import { isPhoneLogin } from "@/lib/phone-login";
import type { createClient } from "@/lib/supabase/server";
import { CreateLogin, MemberActions } from "./portal-access-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
const ROLE: Record<string, string> = { couple: "Couple", parent: "Parent", family: "Family", planner: "Planner" };
type M = { id: string; display_name: string; member_role: string; email: string; login_phone: string | null; user_id: string | null; contact_id: string | null };

/**
 * The couple's portal (D46): one link and one shared login the family passes
 * around, and one "Additional services" link for guests. Logins made earlier
 * for individual people are kept under "Other logins".
 */
export async function PortalAccessCard({ supabase, weddingId, couple, canEdit }: { supabase: Supa; weddingId: string; couple: string; canEdit: boolean }) {
  const [{ data: members }, { data: w }] = await Promise.all([
    supabase.from("wedding_members").select("id, display_name, member_role, email, login_phone, user_id, contact_id").eq("wedding_id", weddingId).order("created_at"),
    supabase.from("weddings").select("guest_token, primary_contact:contacts!weddings_primary_contact_id_fkey(full_name, phone_e164)").eq("id", weddingId).maybeSingle(),
  ]);
  const all = (members ?? []) as M[];
  const shared = all.find((m) => m.login_phone && m.member_role === "couple") ?? all.find((m) => m.login_phone);
  const others = all.filter((m) => m.id !== shared?.id);
  const contact = (Array.isArray(w?.primary_contact) ? w?.primary_contact[0] : w?.primary_contact) as { full_name: string; phone_e164: string | null } | null | undefined;
  const loginUrl = `${env.appUrl()}/portal/login`;
  const servicesUrl = w?.guest_token ? `${env.appUrl()}/g/${w.guest_token as string}` : null;
  return (
    <Card id="portal">
      <CardHeader title="Couple's portal" subtitle="One login for the family to share. Planning opens 90 days before; until then they can share ideas." />
      <div className="space-y-4 px-4 pb-4 sm:px-5">
        <CopyField label="Portal link" value={loginUrl} />

        <div className="rounded-xl ring-1 ring-line">
          {shared ? (
            <div className="space-y-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Shared login <span className="text-xs font-normal text-ink-soft">· {shared.display_name}</span></p>
                {shared.user_id ? <Badge tone="sage">Ready</Badge> : <Badge>Invited</Badge>}
              </div>
              <p className="text-xs text-ink-soft">Mobile {shared.login_phone} + PIN. The couple can share it with whoever needs to plan.</p>
              {canEdit ? <MemberActions memberId={shared.id} couple={couple} phone /> : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">No login yet</p>
                <p className="text-xs text-ink-soft">{contact?.phone_e164 ? `Uses ${contact.full_name}'s number ${contact.phone_e164}.` : "Add a name and mobile number."}</p>
              </div>
              {canEdit ? (contact?.phone_e164
                ? <CreateLogin weddingId={weddingId} couple={couple} label="Create login" preset={{ name: contact.full_name, phone: contact.phone_e164, role: "couple" }} />
                : <CreateLogin weddingId={weddingId} couple={couple} label="Create login" />) : null}
            </div>
          )}
        </div>

        {servicesUrl ? (
          <div className="space-y-1">
            <CopyField label="Additional services link" value={servicesUrl} />
            <p className="text-xs text-ink-soft">For guests: they leave a name and number and ask for airport pickup or drop, a room request or anything else. Requests are listed under Add-on services here, and the couple sees the same link in their portal.</p>
          </div>
        ) : null}

        {others.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-sage-700">Other logins ({others.length})</summary>
            <ul className="mt-2 divide-y divide-line/70 rounded-xl ring-1 ring-line">
              {others.map((m) => {
                const phone = isPhoneLogin(m.email) || !!m.login_phone;
                return (
                  <li key={m.id} className="space-y-1 px-3 py-2.5">
                    <p className="text-sm font-medium">{m.display_name} <span className="text-xs font-normal text-ink-soft">· {ROLE[m.member_role] ?? m.member_role}</span></p>
                    <p className="text-xs text-ink-soft">{phone ? `Mobile ${m.login_phone ?? ""} + PIN` : `Email ${m.email}`}</p>
                    {canEdit ? <MemberActions memberId={m.id} couple={couple} phone={phone} /> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
