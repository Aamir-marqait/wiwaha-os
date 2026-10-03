"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState } from "react";

const field = "mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200";

export function EnquiryForm() {
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; error?: string }>({ status: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ status: "sending" });
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/leads", { method: "POST", body: form }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res && res.ok && json?.ok) setState({ status: "done" });
    else setState({ status: "error", error: json?.error ?? "Something went wrong. Please try again." });
  }

  if (state.status === "done") {
    return (
      <div className="py-10 text-center">
        <p className="font-serif text-3xl text-sage-800">Thank you!</p>
        <p className="mx-auto mt-3 max-w-sm text-ink-soft">We&rsquo;ve received your enquiry and a member of the Wiwaha team will be in touch soon. We can&rsquo;t wait to hear more about your celebration.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="font-serif text-2xl font-semibold">Tell us about your celebration</h2>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="block"><span className="text-sm font-medium">Your name *</span><input name="full_name" required autoComplete="name" className={field} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Phone (WhatsApp) *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98450 12345" className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Email</span><input name="email" type="email" autoComplete="email" className={field} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Preferred date</span><input name="date_wanted" type="date" className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Guests (approx.)</span><input name="guest_count" type="number" min={1} inputMode="numeric" className={field} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Celebration</span>
          <select name="event_type" className={field} defaultValue="wedding">
            <option value="wedding">Wedding</option><option value="reception">Reception</option><option value="engagement">Engagement</option>
            <option value="pre_wedding">Pre-wedding function</option><option value="family_function">Family function</option><option value="corporate">Corporate event</option><option value="other">Something else</option>
          </select>
        </label>
        <label className="block"><span className="text-sm font-medium">Your city</span><input name="city" autoComplete="address-level2" className={field} /></label>
      </div>
      <label className="block"><span className="text-sm font-medium">Anything you&rsquo;d like us to know?</span><textarea name="message" rows={4} className={`${field} h-auto py-2`} /></label>
      <label className="flex items-start gap-2 text-sm text-ink-soft"><input type="checkbox" name="consent_whatsapp" defaultChecked className="mt-1 accent-sage-600" /> You may contact me on WhatsApp about my enquiry.</label>
      <label className="flex items-start gap-2 text-sm text-ink-soft"><input type="checkbox" name="consent_email" className="mt-1 accent-sage-600" /> You may email me about my enquiry.</label>
      {state.status === "error" ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
      <button type="submit" disabled={state.status === "sending"} className={buttonClass("primary", "lg", "w-full")}>{state.status === "sending" ? "Sending…" : "Check availability"}</button>
    </form>
  );
}
