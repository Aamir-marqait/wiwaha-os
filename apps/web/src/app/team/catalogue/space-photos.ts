"use server";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const KIND: Record<string, string> = { outdoor: "lawn", indoor: "hall", semi_open: "other" };

/**
 * Photos for a bookable space: each space has a venue area behind it (made the
 * first time), and its photos live in the media library, where AI moodboards
 * (plain photos) and the Content studio (every photo) find them (D42).
 */
export async function openSpacePhotos(spaceId: string): Promise<{ error?: string }> {
  await requireSection("decor", ["owner", "event_manager", "staff"]);
  const db = createAdminClient("system");
  const { data: space } = await db.from("spaces").select("id, name, kind, description, sort").eq("id", spaceId).maybeSingle();
  if (!space) return { error: "Space not found." };
  let { data: area } = await db.from("venue_areas").select("id").eq("space_id", spaceId).order("sort").limit(1).maybeSingle();
  if (!area) {
    // An area of the same name without a space is the same place: link it.
    const { data: same } = await db.from("venue_areas").select("id, space_id").eq("name", space.name as string).maybeSingle();
    if (same && !same.space_id) {
      await db.from("venue_areas").update({ space_id: spaceId }).eq("id", same.id);
      area = { id: same.id };
    } else {
      const { data: made, error } = await db.from("venue_areas").insert({
        name: same ? `${space.name as string} (space)` : (space.name as string), kind: KIND[space.kind as string] ?? "other",
        description: (space.description as string | null) ?? null, space_id: spaceId, sort: Number(space.sort ?? 100),
      }).select("id").single();
      if (error || !made) return { error: error?.message ?? "Couldn't set up photos for this space." };
      area = made;
    }
  }
  redirect(`/team/decor/areas/${area.id as string}`);
}
