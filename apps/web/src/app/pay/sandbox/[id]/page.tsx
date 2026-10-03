import { Card, buttonClass } from "@wiwaha/ui";
import { formatDateIST, rupees } from "@wiwaha/db";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Wordmark } from "@/components/brand";
import { runRouting } from "@/lib/agents";
import { markPaymentPaid, sandboxPayments } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Payment (sandbox)", robots: { index: false } };

/**
 * Stand-in for a Razorpay payment link while Wiwaha is in sandbox mode: no
 * money moves. With RAZORPAY_KEY_ID set, links go to Razorpay and this page
 * is switched off.
 */
export default async function SandboxPay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  if (!sandboxPayments()) notFound();
  const { id } = await params;
  const { done } = await searchParams;
  const db = createAdminClient("public");
  const { data: p } = await db.from("payments").select("id, label, amount_paise, due_on, status, receipt_number, wedding:weddings(title)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const w = (Array.isArray(p.wedding) ? p.wedding[0] : p.wedding) as { title: string } | null;

  async function pay() {
    "use server";
    if (!sandboxPayments()) return;
    await markPaymentPaid(id, { gateway: "sandbox", ref: `sbx_pay_${Date.now()}` });
    after(runRouting);
    redirect(`/pay/sandbox/${id}?done=1`);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Wordmark subtitle="Secure payment" />
      <Card className="mt-6 p-5">
        <p className="rounded-xl bg-gold-100 px-3 py-2 text-xs text-gold-700">Sandbox mode: this is a test payment page. No money is charged.</p>
        <p className="mt-4 text-sm text-ink-soft">{w?.title}</p>
        <h1 className="font-serif text-2xl font-semibold">{p.label as string}</h1>
        <p className="mt-2 font-serif text-4xl">{rupees(Number(p.amount_paise))}</p>
        <p className="text-sm text-ink-soft">Due {formatDateIST(p.due_on as string)}</p>
        {p.status === "paid" ? (
          <p className="mt-5 rounded-xl bg-sage-100 px-3 py-3 text-sm text-sage-800">{done ? "Thank you! " : ""}Paid{p.receipt_number ? ` · receipt ${p.receipt_number as string}` : ""}. Your receipt is on its way.</p>
        ) : (
          <form action={pay} className="mt-5"><button className={buttonClass("gold", "lg", "w-full")}>Pay {rupees(Number(p.amount_paise))} (test)</button></form>
        )}
      </Card>
    </main>
  );
}
