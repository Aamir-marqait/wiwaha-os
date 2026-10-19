import { Card, PageTitle } from "@wiwaha/ui";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { usageThisMonth } from "../actions";
import { StudioTabs } from "../tabs";
import { BrandForm, type BrandField } from "./brand-form";

export const metadata = { title: "Brand" };

const FIELDS: BrandField[] = [
  { key: "brand_name", label: "Brand name", rows: 1 },
  { key: "tagline", label: "Tagline", rows: 1 },
  { key: "handle", label: "Instagram handle", rows: 1 },
  { key: "description", label: "What Wiwaha is" },
  { key: "positioning", label: "Positioning" },
  { key: "audience", label: "Who we speak to" },
  { key: "voice", label: "Voice" },
  { key: "writing_style", label: "Writing style" },
  { key: "pain_points", label: "Their worries", list: true, rows: 5 },
  { key: "differentiators", label: "What sets us apart", list: true, rows: 5 },
  { key: "pillars", label: "Content pillars", list: true, rows: 6, help: "The calendar rotates through these." },
  { key: "dos", label: "Always", list: true, rows: 4 },
  { key: "donts", label: "Never", list: true, rows: 4 },
  { key: "ctas", label: "Calls to action", list: true, rows: 3 },
  { key: "hashtags", label: "Hashtags", list: true, rows: 4 },
  { key: "hashtag_rule", label: "Hashtag rule", rows: 2 },
  { key: "caption_format", label: "Caption format", rows: 2 },
  { key: "voiceover", label: "Voiceover direction", rows: 2 },
  { key: "visual_style", label: "Visual style", rows: 2 },
  { key: "photography", label: "Photography", rows: 2 },
];

/** The brand profile and logos every script and slide reads. */
export default async function BrandPage() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const [{ data }, usage] = await Promise.all([supabase.from("studio_brand").select("profile, logo_url, logo_light_url, mark_url").eq("id", 1).maybeSingle(), usageThisMonth()]);
  const p = (data?.profile ?? {}) as Record<string, unknown>;
  const initial = Object.fromEntries(FIELDS.map((f) => [f.key, Array.isArray(p[f.key]) ? (p[f.key] as string[]).join("\n") : typeof p[f.key] === "string" ? (p[f.key] as string) : ""]));
  return (
    <>
      <PageTitle title="Brand" subtitle="Everything the studio knows about how Wiwaha sounds and looks. Prices, offers and contact numbers come from the policy book, not from here." />
      <StudioTabs active="brand" />
      <Card className="mb-4 p-4 text-sm">This month: <strong>{usage.used}</strong> of {usage.allowance} generations used. The allowance and slide-edit limits are in Settings → Policy book (studio.content).</Card>
      <Card className="p-4 sm:p-5"><BrandForm fields={FIELDS} initial={initial} logos={{ logoUrl: (data?.logo_url as string | null) ?? "", logoLightUrl: (data?.logo_light_url as string | null) ?? "", markUrl: (data?.mark_url as string | null) ?? "" }} /></Card>
    </>
  );
}
