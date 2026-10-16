import "server-only";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { portalPreview } from "@/lib/portal-preview";
import { createClient } from "@/lib/supabase/server";

export interface PortalMember { id: string; can_start_stages: boolean; can_edit_brief: boolean; can_approve: boolean; can_view_payments: boolean; can_manage_members: boolean; member_role: string; display_name: string }

/** The signed-in family member, their wedding and permissions (RLS scopes every query). */
export async function loadPortal(opts: { allowNoWedding?: boolean } = {}) {
  // Staff "see as the couple" (D42): every query runs as the couple's own login.
  const preview = await portalPreview();
  const viewer = preview ? preview.viewer : await requireClient();
  const supabase = (preview ? preview.client : await createClient("portal")) as Awaited<ReturnType<typeof createClient>>;
  const t = await getDict();
  let q = supabase.from("weddings").select("*").order("event_start").limit(1);
  if (preview) q = q.eq("id", preview.weddingId);
  const { data: wedding } = await q.maybeSingle();
  if (!wedding && !opts.allowNoWedding) redirect("/portal");
  const { data: me } = wedding
    ? await supabase.from("wedding_members").select("*").eq("wedding_id", wedding.id).eq("user_id", viewer.userId).maybeSingle()
    : { data: null };
  return { viewer, supabase, t, wedding, me: (me ?? null) as PortalMember | null, preview: !!preview };
}

export async function stageOf(supabase: Awaited<ReturnType<typeof createClient>>, weddingId: string, key: string) {
  const { data } = await supabase.from("wedding_stages").select("id, status, started_at, unlock_rule, name").eq("wedding_id", weddingId).eq("key", key).maybeSingle();
  return data as { id: string; status: string; started_at: string | null; unlock_rule: string; name: string } | null;
}
