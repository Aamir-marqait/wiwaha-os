"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { portalLink } from "@/app/team/clients/actions";
import { createFamilyLogin, resetFamilyPin, type LoginResult } from "./portal-access-actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

function inviteText(r: LoginResult, couple: string) {
  return `Namaste ${r.name?.split(" ")[0] ?? ""}! Your Wiwaha wedding portal for ${couple} is ready.\n\n${r.url}\nMobile number: ${r.phone}\nPIN: ${r.pin}\n\nWarmly,\nTeam Wiwaha`;
}

/** The PIN, shown once, with the invite to copy or open in your own WhatsApp. */
function Invite({ r, couple, onClose }: { r: LoginResult; couple: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = inviteText(r, couple);
  return (
    <div className="space-y-2 rounded-xl border border-gold-300 bg-gold-50 p-3 text-sm">
      <p className="font-medium">Login ready for {r.name}. PIN <span className="font-mono text-base tracking-widest">{r.pin}</span></p>
      <p className="text-xs text-ink-soft">Share it now: the PIN isn&rsquo;t shown again (you can always make a new one).</p>
      <pre className="whitespace-pre-wrap rounded-lg bg-white p-2 text-xs ring-1 ring-line">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }} className={buttonClass("primary", "sm")}>{copied ? "Copied" : "Copy invite"}</button>
        <a href={`https://wa.me/${(r.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>Open in WhatsApp</a>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "sm")}>Done</button>
      </div>
    </div>
  );
}

/** One-tap login for a family contact we already have, or a new person. */
export function CreateLogin({ weddingId, couple, preset }: { weddingId: string; couple: string; preset?: { name: string; phone: string; role: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(preset ?? { name: "", phone: "", role: "couple" });
  const [res, setRes] = useState<LoginResult | null>(null);
  const [pending, start] = useTransition();
  const make = () => start(async () => { const r = await createFamilyLogin(weddingId, v); setRes(r); if (!r.error) router.refresh(); });
  if (res?.pin) return <Invite r={res} couple={couple} onClose={() => { setRes(null); setOpen(false); }} />;
  if (preset && !open) return <button type="button" disabled={pending} onClick={make} className={buttonClass("secondary", "sm")}>{pending ? "Creating…" : "Create login"}</button>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>+ Add a family login</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); make(); }}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={label}>Name<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required className={field} /></label>
        <label className={label}>Mobile<input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} required type="tel" inputMode="tel" placeholder="98450 12345" className={field} /></label>
        <label className={label}>They are<select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} className={field}><option value="couple">The couple</option><option value="parent">A parent</option><option value="family">Family</option><option value="planner">Their planner</option></select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Creating…" : "Create login"}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
        {res?.error ? <span role="alert" className="text-xs text-burgundy-700">{res.error}</span> : null}
      </div>
    </form>
  );
}

/** For someone who already has a login: a new PIN, or a one-time link that signs them straight in. */
export function MemberActions({ memberId, couple, phone }: { memberId: string; couple: string; phone: boolean }) {
  const [res, setRes] = useState<LoginResult | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (res?.pin) return <Invite r={res} couple={couple} onClose={() => setRes(null)} />;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {phone ? <button type="button" disabled={pending} onClick={() => start(async () => { const r = await resetFamilyPin(memberId); if (r.error) setError(r.error); else setRes(r); })} className={buttonClass("ghost", "sm")}>New PIN</button> : null}
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await portalLink(memberId); if (r.error) setError(r.error); else setLink(r.link ?? null); })} className={buttonClass("ghost", "sm")}>One-time sign-in link</button>
      </div>
      {link ? <p className="break-all rounded-lg bg-ivory-100 p-2 text-xs">{link} <button type="button" onClick={() => navigator.clipboard.writeText(link)} className="ml-1 underline">Copy</button><span className="block text-ink-soft">Works once, for an hour.</span></p> : null}
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </div>
  );
}
