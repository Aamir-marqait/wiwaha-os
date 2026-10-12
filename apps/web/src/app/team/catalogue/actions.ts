"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { CATALOGUES, toRow, type CatalogueValues } from "@/lib/catalogue";
import { friendlyError } from "@/lib/errors";
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
  revalidatePath(`/team/catalogue/${key}`);
  if (error?.code === "23505") return { error: `That ${spec.singular} already exists (a name or code is taken).` };
  return error ? { error: friendlyError(error) } : {};
}
