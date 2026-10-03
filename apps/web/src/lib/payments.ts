import "server-only";
import { createAdminClient } from "./supabase/admin";

/** Live gateway configured? Then the sandbox pay page is switched off. */
export const sandboxPayments = () => !process.env.RAZORPAY_KEY_ID;
export const sandboxEsign = () => !process.env.DIGIO_CLIENT_ID && !process.env.LEEGALITY_API_KEY;

/**
 * Marks a payment paid (idempotent). The database trigger issues the receipt
 * number, applies the milestone's effect (40% signs the contract and opens
 * décor) and queues the Contract & Payments agent.
 */
export async function markPaymentPaid(paymentId: string, p: { amountPaise?: number; method?: "upi" | "card" | "netbanking" | "bank_transfer" | "other"; gateway: string; ref: string | null }) {
  const db = createAdminClient("system");
  const { data, error } = await db.from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString(), paid_amount_paise: p.amountPaise ?? null, method: p.method ?? "upi", gateway: p.gateway, gateway_ref: p.ref })
    .eq("id", paymentId).neq("status", "paid").select("id, receipt_number").maybeSingle();
  if (error) throw new Error(error.message);
  return { updated: !!data, receipt: (data?.receipt_number as string | undefined) ?? null };
}
