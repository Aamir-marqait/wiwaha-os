import { Badge, Card, CardHeader, PageTitle } from "@wiwaha/ui";
import { addDays, formatDateIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SpendForm } from "./spend-form";

export const metadata = { title: "Marketing" };

export default async function MarketingPage() {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient();
  const today = todayIST();
  const [posts, spend, reports] = await Promise.all([
    supabase.from("content_posts").select("id, scheduled_for, platform, theme, caption, status").gte("scheduled_for", addDays(today, -7)).lte("scheduled_for", addDays(today, 14)).order("scheduled_for").order("platform"),
    supabase.from("ad_spend").select("platform, day, spend_paise").gte("day", addDays(today, -28)),
    supabase.from("approvals").select("id, title, summary, status, created_at").eq("kind", "ad_budget").order("created_at", { ascending: false }).limit(4),
  ]);
  const days = new Map<string, { theme: string; posts: { id: string; platform: string; status: string; caption: string }[] }>();
  for (const p of posts.data ?? []) {
    const d = days.get(p.scheduled_for as string) ?? { theme: p.theme as string, posts: [] };
    d.posts.push({ id: p.id as string, platform: p.platform as string, status: p.status as string, caption: p.caption as string });
    days.set(p.scheduled_for as string, d);
  }
  const spendBy = (spend.data ?? []).reduce<Record<string, number>>((m, s) => ({ ...m, [s.platform as string]: (m[s.platform as string] ?? 0) + Number(s.spend_paise) }), {});
  return (
    <>
      <PageTitle title="Marketing" subtitle="Content Studio drafts next week every week; nothing posts without approval." />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Post calendar" subtitle="Brand rhythm: Mon problem/solution · Tue feature · Wed testimonial · Thu tips · Fri–Sun showcases" action={<Link href="/team/approvals" className="text-sm text-sage-700 underline">Approve</Link>} />
          <ul className="divide-y divide-line/70">
            {days.size === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">The first week of drafts appears after the next tick.</li> : null}
            {[...days.entries()].map(([d, v]) => (
              <li key={d} className="px-4 py-3 sm:px-5">
                <p className="text-sm font-medium">{formatDateIST(d, { weekday: "short", day: "numeric", month: "short" })} · {v.theme}</p>
                <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{v.posts[0]?.caption}</p>
                <p className="mt-1 flex flex-wrap gap-1">{v.posts.map((p) => <Badge key={p.id} tone={p.status === "scheduled" || p.status === "posted" ? "solid" : p.status === "rejected" ? "neutral" : "gold"}>{p.platform} · {p.status.replace("_", " ")}</Badge>)}</p>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Ad spend (28 days)" subtitle="Import from Meta Ads Manager and Google Ads until the APIs are connected" />
            <div className="space-y-3 px-4 py-3 sm:px-5">
              <p className="text-sm">Meta {rupees(spendBy.meta ?? 0)} · Google {rupees(spendBy.google ?? 0)}</p>
              <SpendForm />
            </div>
          </Card>
          <Card>
            <CardHeader title="Weekly ads reports" subtitle="Recommendations only; Prashanth decides" />
            <ul className="divide-y divide-line/70">
              {(reports.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">The first report arrives on the next report day.</li> : null}
              {(reports.data ?? []).map((r) => <li key={r.id as string} className="px-4 py-3 text-sm sm:px-5"><p className="font-medium">{r.title as string}</p><p className="text-xs text-ink-soft">{r.summary as string} · {r.status as string}</p></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
