import { PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogueEditor } from "@/components/catalogue-editor";
import { requireStaff } from "@/lib/auth";
import { CATALOGUES } from "@/lib/catalogue";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: CATALOGUES[key]?.title ?? "List" };
}

export default async function CataloguePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const spec = CATALOGUES[key];
  if (!spec) notFound();
  const viewer = await requireStaff(spec.viewRoles);
  const supabase = await createClient();
  let q = supabase.from(spec.table).select("*");
  for (const o of spec.order) q = q.order(o.column, { ascending: o.ascending !== false });
  const { data } = await q.limit(1000);
  return (
    <>
      <Link href="/team/settings/lists" className="text-sm text-sage-700 hover:underline">← All lists</Link>
      <PageTitle title={spec.title} subtitle={spec.description} />
      <CatalogueEditor spec={spec} rows={(data ?? []) as Record<string, unknown>[]} canEdit={spec.editRoles.includes(viewer.profile.role)} />
    </>
  );
}
