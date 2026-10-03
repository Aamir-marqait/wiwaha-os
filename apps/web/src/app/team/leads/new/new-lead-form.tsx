"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState } from "react";
import { createManualLead, type FormState } from "../actions";

const field = "mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200";

export function NewLeadForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createManualLead, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Name *</span><input name="full_name" required className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Source</span>
          <select name="source" defaultValue="phone" className={field}>
            <option value="phone">Phone call</option><option value="walk_in">Walk-in</option><option value="referral">Referral</option>
            <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="wedmegood">WedMeGood</option>
            <option value="google_ads">Google Ads</option><option value="meta_form">Meta lead form</option><option value="manual">Other / manual</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Phone</span><input name="phone" type="tel" inputMode="tel" className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Email</span><input name="email" type="email" className={field} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block"><span className="text-sm font-medium">Date wanted</span><input name="date_wanted" type="date" className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Guests</span><input name="guest_count" type="number" min={1} className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Budget (₹ lakh)</span><input name="budget_lakhs" type="number" min={0} step="0.5" className={field} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">City</span><input name="city" className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Source detail</span><input name="source_detail" placeholder="e.g. referred by the Sharmas" className={field} /></label>
      </div>
      <label className="block"><span className="text-sm font-medium">What did they ask?</span><textarea name="message" rows={3} className={`${field} h-auto py-2`} /></label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="date_flexible" className="accent-sage-600" /> Date is flexible</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="consent_whatsapp" defaultChecked className="accent-sage-600" /> OK to WhatsApp</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="consent_email" className="accent-sage-600" /> OK to email</label>
      </div>
      {state.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "lg")}>{pending ? "Saving…" : "Save lead"}</button>
      <p className="text-xs text-ink-soft">Lead Desk will score it and draft a reply into the approval queue.</p>
    </form>
  );
}
