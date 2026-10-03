"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRef, useState, useTransition } from "react";
import { endSimCall, simSay, startSimCall } from "./actions";

interface Line { who: "caller" | "agent" | "system"; text: string }

const TRY = [
  "What's the price for a wedding?",
  "I'm calling from Hyderabad",
  "Can you give us a discount?",
  "Is 14th February available for 300 guests?",
  "ನಿಮ್ಮಲ್ಲಿ ಎಷ್ಟು ಕೊಠಡಿಗಳಿವೆ?",
  "Do you allow drones for the pheras?",
  "We'd like to come and see the venue",
  "Can I talk to a real person?",
];

export function Simulator() {
  const [callId, setCallId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [from, setFrom] = useState("+91 98450 11111");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const push = (l: Line[]) => { setLines((x) => [...x, ...l]); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); };

  function say(t: string) {
    if (!callId || !t.trim()) return;
    push([{ who: "caller", text: t }]);
    setText("");
    start(async () => {
      const r = await simSay(callId, t);
      if (r.error) return push([{ who: "system", text: r.error }]);
      push([{ who: "agent", text: r.reply!.say }]);
      if (r.reply!.action === "transfer") push([{ who: "system", text: `→ Transferring the call to ${r.reply!.transferTo} (on a real line the phone rings now)` }]);
      if (r.reply!.action === "hangup") push([{ who: "system", text: "Call ended by the concierge." }]);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="flex h-[70dvh] flex-col rounded-2xl border border-line bg-white">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {lines.length === 0 ? <p className="text-sm text-ink-soft">Start a call to talk to the Voice Concierge exactly as a caller would. Everything it does is real: leads, visits, tasks and approvals are created.</p> : null}
          {lines.map((l, i) => (
            <div key={i} className={l.who === "caller" ? "ml-10 rounded-2xl rounded-br-sm bg-sage-700 px-3 py-2 text-sm text-white" : l.who === "agent" ? "mr-10 rounded-2xl rounded-bl-sm bg-ivory-100 px-3 py-2 text-sm" : "text-center text-xs text-ink-soft"}>{l.text}</div>
          ))}
          <div ref={end} />
        </div>
        {callId ? (
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); say(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something as the caller…" className="h-11 flex-1 rounded-xl border border-line px-3 text-sm" />
            <button disabled={pending} className={buttonClass("primary", "md")}>Say</button>
          </form>
        ) : null}
      </div>
      <div className="space-y-4">
        {!callId ? (
          <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
            <label className="block text-xs font-medium text-ink-soft">Caller's number<input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line px-3 text-sm" /></label>
            <button disabled={pending} onClick={() => start(async () => { const r = await startSimCall(from); if (r.error) return push([{ who: "system", text: r.error }]); setLines([{ who: "system", text: "Call connected" }, { who: "agent", text: r.reply!.say }]); setCallId(r.callId!); })} className={buttonClass("primary", "md", "w-full")}>📞 Start a call</button>
          </div>
        ) : (
          <button disabled={pending} onClick={() => start(async () => { const r = await endSimCall(callId); push([{ who: "system", text: r.summary ? `Call summary saved to the lead: ${r.summary}` : r.error ?? "" }]); setCallId(null); })} className={buttonClass("danger", "md", "w-full")}>Hang up</button>
        )}
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Try the scenarios</p>
          <ul className="mt-2 space-y-1">
            {TRY.map((t) => <li key={t}><button disabled={!callId || pending} onClick={() => say(t)} className="text-left text-sm text-sage-700 hover:underline disabled:text-ink-soft">{t}</button></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
