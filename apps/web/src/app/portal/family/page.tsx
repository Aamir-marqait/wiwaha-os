import { Card } from "@wiwaha/ui";
import { InviteForm, PermToggle } from "../_ui/forms";
import type { Perm } from "../actions";
import { loadPortal } from "../_ui/load";
import { PortalShell } from "../_ui/shell";

export const metadata = { title: "Family" };

const PERMS: { key: Perm; label: string }[] = [
  { key: "can_start_stages", label: "Start stages" }, { key: "can_edit_brief", label: "Edit brief & guests" }, { key: "can_approve", label: "Approve menus, décor, quote" },
  { key: "can_view_payments", label: "See payments" }, { key: "can_manage_members", label: "Manage family" },
];

export default async function FamilyPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const { data: members } = await supabase.from("wedding_members").select("*").eq("wedding_id", w.id).order("created_at");
  const manage = !!me?.can_manage_members;
  return (
    <PortalShell t={t} wedding={w} first={first} active="family">
      <p className="text-sm text-ink-soft">Everyone gets their own login. Choose what each person can do; every change is recorded.</p>
      <div className="space-y-3">
        {(members ?? []).map((m) => (
          <Card key={m.id as string} className="p-4">
            <p className="font-medium">{m.display_name as string} <span className="text-xs capitalize text-ink-soft">· {String(m.member_role)}</span></p>
            <p className="text-xs text-ink-soft">{m.email as string}{m.accepted_at ? "" : " · invitation pending"}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {PERMS.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2 rounded-xl bg-ivory-100 px-3 py-2 text-sm">
                  <span>{p.label}</span>
                  <PermToggle memberId={m.id as string} perm={p.key} value={!!m[p.key]} disabled={!manage || m.id === me?.id} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {manage ? <Card className="p-4"><h2 className="mb-3 font-serif text-xl font-semibold">Invite family</h2><InviteForm weddingId={w.id as string} /></Card> : null}
    </PortalShell>
  );
}
