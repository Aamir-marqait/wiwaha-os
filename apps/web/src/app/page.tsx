import { buttonClass } from "@wiwaha/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { getViewer, isStaff } from "@/lib/auth";

/** Signed in: straight to the right place. Signed out: choose team or client login. */
export default async function Home() {
  const viewer = await getViewer();
  if (viewer) redirect(isStaff(viewer.profile.role) ? "/team" : "/portal");
  return (
    <main className="ornament flex min-h-dvh items-center justify-center bg-ivory-100 px-4 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-3xl bg-white p-6 text-center shadow-[var(--shadow-card)] ring-1 ring-line sm:p-8">
        <div className="inline-block"><Wordmark subtitle="Wiwaha by Praman" /></div>
        <div className="space-y-3">
          <Link href="/portal/login" className={buttonClass("primary", "lg", "w-full")}>Client login</Link>
          <p className="text-xs text-ink-soft">For couples and their families, to plan your celebration with us.</p>
        </div>
        <div className="space-y-3 border-t border-line pt-5">
          <Link href="/login" className={buttonClass("ghost", "lg", "w-full")}>Wiwaha team login</Link>
          <p className="text-xs text-ink-soft">For the Wiwaha team.</p>
        </div>
        <p className="text-sm"><Link href="/enquire" className="text-sage-700 underline">Planning a wedding? Enquire here</Link></p>
      </div>
    </main>
  );
}
