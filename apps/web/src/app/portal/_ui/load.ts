import "server-only";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { portalPreview } from "@/lib/portal-preview";
import { planningState } from "./planning";
import { createClient } from "@/lib/supabase/server";

export interface PortalMember { can_fill_decor: boolean; id: string; can_start_stages: boolean; can_edit_brief: boolean; can_approve: boolean; can_view_payments: boolean; can_manage_members: boolean; member_role: string; display_name: string }

/** The signed-in family member, their wedding and permissions (RLS scopes every query). */
export async function loadPortal(opts: { allowNoWedding?: boolean; anytime?: boolean } = {}) {
  // Staff "see as the couple" (D42): every query runs as the couple's own login.
  const preview = await portalPreview();
  const viewer = preview ? preview.viewer : await requireClient();
  const supabase = (preview ? preview.client : await createClient("portal")) as Awaited<ReturnType<typeof createClient>>;
  const t = await getDict();
  let q = supabase.from("weddings").select("*").order("event_start").limit(1);
  if (preview) q = q.eq("id", preview.weddingId);
  const { data: wedding } = await q.maybeSingle();
  if (!wedding && !opts.allowNoWedding) redirect("/portal");
  // Before planning opens (90 days out) the family has the home page and the ideas page, nothing else.
  if (wedding && !opts.anytime && !planningState(wedding.event_start as string).open) redirect("/portal");
  const { data: me } = wedding
    ? await supabase.from("wedding_members").select("*").eq("wedding_id", wedding.id).eq("user_id", viewer.userId).maybeSingle()
    : { data: null };
  // The family has two things to do: share ideas, and fill in the décor form. Everything else is for them to read; the team sets it up.
  const mine = me as (Omit<PortalMember, "can_fill_decor">) | null;
  const readOnly: PortalMember | null = mine ? { ...mine, can_fill_decor: mine.can_edit_brief, can_edit_brief: false, can_start_stages: false, can_approve: false, can_manage_members: false } : null;
  return { viewer, supabase, t, wedding, me: readOnly, preview: !!preview };
}

export async function stageOf(supabase: Awaited<ReturnType<typeof createClient>>, weddingId: string, key: string) {
  const { data } = await supabase.from("wedding_stages").select("id, status, started_at, unlock_rule, name").eq("wedding_id", weddingId).eq("key", key).maybeSingle();
  return data as { id: string; status: string; started_at: string | null; unlock_rule: string; name: string } | null;
}
