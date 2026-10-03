import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getViewer, isStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Team sign in" };

export default async function TeamLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await getViewer();
  if (viewer) redirect(isStaff(viewer.profile.role) ? "/team" : "/portal");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="ornament hidden flex-col justify-between bg-sage-800 p-12 text-ivory-50 lg:flex">
        <Wordmark subtitle="Operating system" light />
        <blockquote className="max-w-md font-serif text-3xl leading-snug text-ivory-100">
          “We&rsquo;ve got this handled.”
          <span className="mt-3 block font-sans text-sm text-sage-200">Agents do the routine work. You make the decisions that matter.</span>
        </blockquote>
        <p className="text-xs text-sage-300">Private estate · 15 km from Bengaluru airport</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Wordmark subtitle="Operating system" /></div>
          <h1 className="font-serif text-3xl font-semibold text-ink">Team sign in</h1>
          <p className="mb-6 mt-1 text-sm text-ink-soft">For the Wiwaha team. Couples and families, please use the <a className="text-sage-700 underline" href="/portal/login">client portal</a>.</p>
          <LoginForm surface="team" next={next} />
        </div>
      </section>
    </main>
  );
}
