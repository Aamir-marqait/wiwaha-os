"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { CATALOGUES, toRow, type CatalogueValues } from "@/lib/catalogue";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Adds (id null) or updates a row in one of the reference lists. Row-level security has the final say. */
export async function saveCatalogueRow(key: string, id: string | null, values: CatalogueValues): Promise<{ error?: string }> {
  const spec = CATALOGUES[key];
  if (!spec) return { error: "Unknown list." };
  await requireStaff(spec.editRoles);
  const parsed = toRow(spec, values);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from(spec.table).update(parsed.row).eq("id", id).match(spec.fixed ?? {})
    : await supabase.from(spec.table).insert({ ...(spec.fixed ?? {}), ...parsed.row });
  // Renamed or re-sized places show their new details on every page, the calendar included.
  if (!error && key === "spaces" && id && typeof parsed.row.name === "string") await createAdminClient("system").from("venue_areas").update({ name: parsed.row.name }).eq("space_id", id);
  revalidatePath("/team", "layout");
  if (error?.code === "23505") return { error: `That ${spec.singular} already exists (a name or code is taken).` };
  return error ? { error: friendlyError(error) } : {};
}

/** Removes a row from one of the lists (after the role check). Rows other records point to can't go: those can be switched off with "Active" instead. */
export async function deleteCatalogueRow(key: string, id: string): Promise<{ error?: string }> {
  const spec = CATALOGUES[key];
  if (!spec) return { error: "Unknown list." };
  await requireStaff(spec.editRoles);
  const { data, error } = await createAdminClient("system").from(spec.table).delete().eq("id", id).match(spec.fixed ?? {}).select("id");
  revalidatePath(`/team/catalogue/${key}`);
  if (error?.code === "23503") return { error: `This ${spec.singular} is used elsewhere, so it can't be deleted. ${spec.fields.some((f) => f.key === "active") ? "Untick Active to hide it instead." : ""}`.trim() };
  if (error) return { error: friendlyError(error) };
  return data?.length ? {} : { error: "Couldn't find it." };
}
