import { Card, buttonClass } from "@wiwaha/ui";
import { formatDateIST } from "@wiwaha/db";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Wordmark } from "@/components/brand";
import { runRouting } from "@/lib/agents";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Booking request", robots: { index: false } };

/** A vendor confirms or declines a lock-in request from the link in their email. */
export default async function VendorReply({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{20,64}$/.test(token)) notFound();
  const db = createAdminClient("public");
  const { data: b } = await db.from("vendor_bookings").select("id, status, brief, replied_at, reply_note, vendor:vendors(name, category), wedding:weddings(title, event_start, event_end)").eq("reply_token", token).maybeSingle();
  if (!b) notFound();
  const v = (Array.isArray(b.vendor) ? b.vendor[0] : b.vendor) as { name: string; category: string } | null;
  const w = (Array.isArray(b.wedding) ? b.wedding[0] : b.wedding) as { title: string; event_start: string; event_end: string } | null;

  async function reply(form: FormData) {
    "use server";
    const answer = form.get("answer") === "confirmed" ? "confirmed" : "declined";
    const admin = createAdminClient("system");
    const { data } = await admin.from("vendor_bookings").update({ status: answer, replied_at: new Date().toISOString(), reply_note: String(form.get("note") ?? "").slice(0, 1000) || null })
      .eq("reply_token", token).eq("status", "requested").select("id, wedding_id").maybeSingle();
    if (data) {
      await admin.from("agent_tasks").insert({ kind: "vendor_replied", wedding_id: data.wedding_id, payload: { booking_id: data.id, status: answer } });
      after(runRouting);
    }
    redirect(`/vendor/reply/${token}`);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Wordmark subtitle="Vendor booking" />
      <Card className="mt-6 p-5">
        <p className="text-sm text-ink-soft">{v?.name} · <span className="capitalize">{v?.category}</span></p>
        <h1 className="font-serif text-2xl font-semibold">{w?.title}</h1>
        {w ? <p className="text-sm text-ink-soft">{formatDateIST(w.event_start)}{w.event_end !== w.event_start ? ` – ${formatDateIST(w.event_end)}` : ""} · Wiwaha by Praman</p> : null}
        {b.brief ? <p className="mt-3 text-sm">{b.brief as string}</p> : null}
        {b.status === "requested" ? (
          <form action={reply} className="mt-5 space-y-3">
            <label className="block text-sm">Note (optional)<input name="note" className="mt-1 block h-10 w-full rounded-xl border border-line px-3 text-sm" /></label>
            <div className="flex gap-2">
              <button name="answer" value="confirmed" className={buttonClass("primary", "md", "flex-1")}>Confirm</button>
              <button name="answer" value="declined" className={buttonClass("secondary", "md", "flex-1")}>Decline</button>
            </div>
          </form>
        ) : (
          <p className="mt-5 rounded-xl bg-sage-100 px-3 py-3 text-sm text-sage-800">Thank you. You {b.status === "confirmed" ? "confirmed" : "declined"} this booking{b.replied_at ? ` on ${formatDateIST(b.replied_at as string)}` : ""}. The event manager will be in touch.</p>
        )}
      </Card>
    </main>
  );
}
