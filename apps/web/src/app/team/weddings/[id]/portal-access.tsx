import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { CopyField } from "@/components/copy-field";
import { env } from "@/lib/env";
import { isPhoneLogin } from "@/lib/phone-login";
import type { createClient } from "@/lib/supabase/server";
import { CreateLogin, MemberActions } from "./portal-access-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
const ROLE: Record<string, string> = { couple: "Couple", parent: "Parent", family: "Family", planner: "Planner" };

/** The couple's portal (D44): the link, who can sign in, and logins to create and share. */
export async function PortalAccessCard({ supabase, weddingId, couple, canEdit }: { supabase: Supa; weddingId: string; couple: string; canEdit: boolean }) {
  const [{ data: members }, { data: family }] = await Promise.all([
    supabase.from("wedding_members").select("id, display_name, member_role, email, login_phone, user_id").eq("wedding_id", weddingId).order("created_at"),
    supabase.from("wedding_contacts").select("relation, contact:contacts(full_name, phone_e164)").eq("wedding_id", weddingId),
  ]);
  const phones = new Set((members ?? []).map((m) => m.login_phone as string | null).filter(Boolean));
  const without = (family ?? []).flatMap((f) => {
    const c = (Array.isArray(f.contact) ? f.contact[0] : f.contact) as { full_name: string; phone_e164: string | null } | null;
    if (!c?.phone_e164 || phones.has(c.phone_e164)) return [];
    const rel = ((f.relation as string | null) ?? "").toLowerCase();
    const role = /bride|groom|couple/.test(rel) && !/father|mother|parent/.test(rel) ? "couple" : /father|mother|parent/.test(rel) ? "parent" : "family";
    return [{ full_name: c.full_name, phone_e164: c.phone_e164, role }];
  });
  const url = `${env.appUrl()}/portal/login`;
  return (
    <Card>
      <CardHeader title="Couple's portal" subtitle="Families sign in with their mobile number and a PIN. Planning opens 90 days before; until then they can share ideas." />
      <div className="space-y-3 px-4 pb-4 sm:px-5">
        <CopyField label="Portal link" value={url} />
        <ul className="divide-y divide-line/70 rounded-xl ring-1 ring-line">
          {(members ?? []).length === 0 && without.length === 0 ? <li className="px-3 py-3 text-sm text-ink-soft">No logins yet.</li> : null}
          {(members ?? []).map((m) => {
            const phone = isPhoneLogin(m.email as string) || !!m.login_phone;
            return (
              <li key={m.id as string} className="space-y-1 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{m.display_name as string} <span className="text-xs font-normal text-ink-soft">· {ROLE[m.member_role as string] ?? String(m.member_role)}</span></p>
                  {m.user_id ? <Badge tone="sage">Login ready</Badge> : <Badge>Invited by email</Badge>}
                </div>
                <p className="text-xs text-ink-soft">{phone ? `Mobile ${(m.login_phone as string | null) ?? ""} + PIN` : (m.email as string)}</p>
                {canEdit ? <MemberActions memberId={m.id as string} couple={couple} phone={phone} /> : null}
              </li>
            );
          })}
          {canEdit ? without.map((c) => (
            <li key={c.phone_e164} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div><p className="text-sm font-medium">{c.full_name}</p><p className="text-xs text-ink-soft">{c.phone_e164} · no login yet</p></div>
              <CreateLogin weddingId={weddingId} couple={couple} preset={{ name: c.full_name, phone: c.phone_e164, role: c.role }} />
            </li>
          )) : null}
        </ul>
        {canEdit ? <CreateLogin weddingId={weddingId} couple={couple} /> : null}
      </div>
    </Card>
  );
}
