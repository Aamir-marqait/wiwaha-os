import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { ChatLauncher } from "@/components/chat-widget";
import { createAdminClient } from "@/lib/supabase/admin";
import { EnquiryForm } from "./enquiry-form";

export const metadata: Metadata = { title: "Check availability", robots: { index: true, follow: true } };
export const dynamic = "force-dynamic";

/**
 * The public enquiry form (D44). Shared as a link (e.g. by the WhatsApp
 * auto-reply) or embedded on the Wiwaha website with ?embed=1. Every
 * submission becomes a lead in the dashboard.
 */
export default async function EnquirePage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const { embed } = await searchParams;
  const { data } = await createAdminClient("public").from("lead_sources").select("label").eq("active", true).order("sort").order("label");
  const heard = (data ?? []).map((r) => r.label as string);
  if (embed) {
    return (
      <main className="bg-transparent p-3 sm:p-4">
        <EnquiryForm heardOptions={heard} compact />
      </main>
    );
  }
  return (
    <main className="ornament min-h-dvh bg-ivory-100">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:py-16 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <section className="lg:sticky lg:top-16">
          <Wordmark subtitle="Your wedding, your way" />
          <h1 className="mt-8 font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">Check availability for your date</h1>
          <p className="mt-4 max-w-md text-ink-soft">A private 4-acre estate just 15 km from Bengaluru airport, with guest rooms for your family and the freedom to make every detail your own. Tell us a little about your celebration and we&rsquo;ll be in touch shortly.</p>
          <ul className="mt-6 space-y-2 text-sm text-sage-800">
            <li>✦ Private estate, never a hotel corner</li>
            <li>✦ Guest rooms on site for your family</li>
            <li>✦ In-house catering or your own caterer</li>
          </ul>
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-8">
          <EnquiryForm heardOptions={heard} />
        </section>
      </div>
      <ChatLauncher />
    </main>
  );
}
