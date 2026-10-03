import { Card, buttonClass } from "@wiwaha/ui";
import { notFound, redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { sandboxEsign } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Sign your contract (sandbox)", robots: { index: false } };

/** Stand-in for the e-sign provider (Digio/Leegality) until its account is live. */
export default async function SandboxSign({ params }: { params: Promise<{ id: string }> }) {
  if (!sandboxEsign()) notFound();
  const { id } = await params;
  const db = createAdminClient("public");
  const { data: c } = await db.from("contracts").select("id, version, status, body_md, esign_provider, esign_completed_at").eq("id", id).maybeSingle();
  if (!c || c.esign_provider !== "sandbox" || !["sent", "signed"].includes(c.status as string)) notFound();

  async function sign(form: FormData) {
    "use server";
    const name = String(form.get("name") ?? "").trim();
    if (!name || !sandboxEsign()) return;
    const admin = createAdminClient("system");
    await admin.from("contracts").update({ status: "signed", signed_at: new Date().toISOString(), esign_completed_at: new Date().toISOString(), esign_ref: `sbx_signed_by:${name.slice(0, 80)}` }).eq("id", id).eq("status", "sent");
    // The DB guard allows sent → signed; already-signed (40% paid) just records the e-signature.
    await admin.from("contracts").update({ esign_completed_at: new Date().toISOString() }).eq("id", id).is("esign_completed_at", null);
    redirect(`/sign/sandbox/${id}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Wordmark subtitle="Venue agreement" />
      <p className="mt-6 rounded-xl bg-gold-100 px-3 py-2 text-xs text-gold-700">Sandbox mode: a stand-in for e-signature. Once the e-sign provider is connected, contracts are signed there.</p>
      <Card className="mt-4 bg-white p-5 text-black"><Markdown source={c.body_md as string} /></Card>
      {c.esign_completed_at ? (
        <p className="mt-5 rounded-xl bg-sage-100 px-3 py-3 text-sm text-sage-800">Signed. Thank you! A copy is in your portal.</p>
      ) : (
        <form action={sign} className="mt-5 space-y-3">
          <label className="block text-sm">Type your full name to sign<input name="name" required className="mt-1 block h-11 w-full rounded-xl border border-line px-3" /></label>
          <button className={buttonClass("primary", "lg", "w-full")}>Sign the agreement</button>
        </form>
      )}
    </main>
  );
}
