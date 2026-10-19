import { PageTitle } from "@wiwaha/ui";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StudioTabs } from "../tabs";
import { CreateForm } from "./create-form";

export const metadata = { title: "Create a post" };

export default async function NewStudioItem() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const [{ data: brand }, { data: photos }] = await Promise.all([
    supabase.from("studio_brand").select("profile").eq("id", 1).maybeSingle(),
    supabase.from("media_assets").select("id, url, thumb_url, kind, title").eq("status", "ready").order("created_at", { ascending: false }).limit(120),
  ]);
  const pillars = (((brand?.profile ?? {}) as { pillars?: string[] }).pillars ?? []);
  return (
    <>
      <PageTitle title="Create" subtitle="Give a brief; the studio writes the script for you to read, change and approve. Nothing renders until you approve." />
      <StudioTabs active="new" />
      <CreateForm pillars={pillars} photos={(photos ?? []).map((p) => ({ id: p.id as string, url: (p.kind === "video" ? p.thumb_url : p.url) as string, kind: p.kind as string, title: (p.title as string | null) ?? "" }))} />
    </>
  );
}
