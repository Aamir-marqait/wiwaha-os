import { Card, buttonClass } from "@wiwaha/ui";
import { formatDateIST } from "@wiwaha/db";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Wordmark } from "@/components/brand";
import { runRouting } from "@/lib/agents";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Booking request", robots: { index: false } };

/** A vendor confirms or declines a lock-in request (with its work order) from the link in their email. */
export default async function VendorReply({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{20,64}$/.test(token)) notFound();
  const db = createAdminClient("public");
  const { data: b } = await db.from("vendor_bookings").select("id, status, brief, replied_at, reply_note, work_order, vendor:vendors(name, category), wedding:weddings(title, event_start, event_end)").eq("reply_token", token).maybeSingle();
  if (!b) notFound();
  const v = (Array.isArray(b.vendor) ? b.vendor[0] : b.vendor) as { name: string; category: string } | null;
  const w = (Array.isArray(b.wedding) ? b.wedding[0] : b.wedding) as { title: string; event_start: string; event_end: string } | null;

  async function reply(form: FormData) {
    "use server";
    const answer = form.get("answer") === "confirmed" ? "confirmed" : "declined";
    const admin = createAdminClient("system");
    const { data } = await admin.from("vendor_bookings").update({ status: answer, replied_at: new Date().toISOString(), reply_note: String(form.get("note") ?? "").slice(0, 1000) || null })
      .eq("reply_token", token).eq("status", "requested").select("id, wedding_id").maybeSingle();
    // The database queues the Vendor Coordinator (vendor_bookings_on_answer); route it now.
    if (data) after(runRouting);
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
        {((b.work_order ?? []) as { description: string; quantity: number; function_name: string | null; date: string | null }[]).length ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Work order</p>
            <ul className="mt-1 space-y-1 text-sm">
              {((b.work_order ?? []) as { description: string; quantity: number; function_name: string | null; date: string | null }[]).map((i, n) => (
                <li key={n} className="rounded-lg bg-ivory-100 px-3 py-2">{i.description}{i.quantity !== 1 ? ` × ${i.quantity}` : ""}{i.date ? <span className="block text-xs text-ink-soft">{formatDateIST(i.date, { weekday: "short", day: "numeric", month: "short" })}</span> : null}</li>
              ))}
            </ul>
          </div>
        ) : null}
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
