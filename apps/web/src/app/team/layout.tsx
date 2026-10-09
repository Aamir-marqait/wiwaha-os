import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { BottomNav, SideNav } from "@/components/team-nav";
import { requireStaff, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Team", template: "%s · Wiwaha OS" } };

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const { count } = await supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending");
  const approvals = count ?? 0;
  const { count: sendCount } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("status", "approved").eq("direction", "outbound").in("channel", ["whatsapp", "email"]);
  const toSend = sendCount ?? 0;
  const first = viewer.profile.full_name.split(" ")[0];

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[248px_1fr]">
      <aside className="ornament sticky top-0 hidden h-dvh flex-col bg-sage-800 px-4 py-6 lg:flex">
        <Link href="/team" className="mb-8 px-2"><Wordmark subtitle="Wiwaha OS" light /></Link>
        <SideNav approvals={approvals} toSend={toSend} />
        <div className="mt-auto rounded-xl bg-sage-900/40 px-3 py-3 text-sm text-sage-100">
          <p className="font-medium text-white">{viewer.profile.full_name}</p>
          <p className="text-xs text-sage-300">{viewer.profile.title ?? ROLE_LABELS[viewer.profile.role]}</p>
          <form action="/auth/signout" method="post" className="mt-2"><button className="text-xs text-gold-200 hover:underline">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ivory-50/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/team"><Wordmark /></Link>
          <form action="/auth/signout" method="post"><button className="rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-800" aria-label="Sign out">{first} · Sign out</button></form>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>
      <BottomNav approvals={approvals} />
    </div>
  );
}
