import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { PortalLogin as PhoneOrEmailLogin } from "./portal-login";
import { getViewer, isStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Client login" };

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await getViewer();
  if (viewer) redirect(isStaff(viewer.profile.role) ? "/team" : "/portal");
  const { next } = await searchParams;
  return (
    <main className="ornament flex min-h-dvh items-center justify-center bg-ivory-100 px-4 py-12">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-8">
        <div className="mb-6 text-center"><div className="inline-block"><Wordmark subtitle="Your wedding portal" /></div></div>
        <h1 className="text-center font-serif text-2xl font-semibold text-ink">Client login</h1>
        <p className="mb-6 mt-1 text-center text-sm text-ink-soft">Use your mobile number and the PIN your event manager shared with you.</p>
        <PhoneOrEmailLogin next={next} />
        <p className="mt-6 text-center text-xs text-ink-soft">Wiwaha team? <a href="/login" className="text-sage-700 underline">Team login</a></p>
      </div>
    </main>
  );
}
