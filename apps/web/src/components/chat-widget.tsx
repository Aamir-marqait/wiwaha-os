"use client";
import { buttonClass } from "@wiwaha/ui";
import { MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Msg { id: string; from: "you" | "wiwaha"; body: string }
const KEY = "wiwaha-chat-token";

function readToken(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
function saveToken(t: string) {
  try { window.localStorage.setItem(KEY, t); } catch { /* private mode: chat still works for this page view */ }
}

/** Website chat: starts a lead (source "web_chat"); replies arrive here once the team approves them. */
export function ChatPanel({ embedded = false }: { embedded?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { setToken(readToken()); }, []);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const load = async () => {
      const r = await fetch(`/api/chat?token=${encodeURIComponent(token)}`).then((x) => x.json()).catch(() => null) as { messages?: Msg[] } | null;
      if (live && r?.messages) setMessages(r.messages);
    };
    void load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, [token]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send(body: Record<string, string>) {
    setBusy(true); setError(null);
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "We couldn't send that. Please try again." })) as { token?: string; error?: string };
    setBusy(false);
    if (r.error) { setError(r.error); return false; }
    if (r.token && r.token !== token) { saveToken(r.token); setToken(r.token); }
    setMessages((m) => [...m, { id: `local-${Date.now()}`, from: "you", body: body.message ?? "" }]);
    return true;
  }

  return (
    <div className={`flex flex-col bg-white ${embedded ? "h-dvh" : "h-[min(560px,80dvh)] rounded-2xl shadow-xl ring-1 ring-line"}`}>
      <div className="rounded-t-2xl bg-sage-800 px-4 py-3 text-ivory-50">
        <p className="font-serif text-lg">Wiwaha by Praman</p>
        <p className="text-xs text-sage-200">Ask us anything about your celebration. We reply here, usually within the hour.</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? <p className="text-sm text-ink-soft">Namaste! Tell us your date and guest count, and we'll check availability for you.</p> : null}
        {messages.map((m) => <div key={m.id} className={m.from === "you" ? "ml-8 whitespace-pre-line rounded-2xl rounded-br-sm bg-sage-700 px-3 py-2 text-sm text-white" : "mr-8 whitespace-pre-line rounded-2xl rounded-bl-sm bg-ivory-100 px-3 py-2 text-sm"}>{m.body}</div>)}
        {token && messages.length > 0 && messages.at(-1)?.from === "you" ? <p className="text-center text-xs text-ink-soft">Thank you! Our team will reply here shortly.</p> : null}
        <div ref={end} />
      </div>
      {error ? <p className="px-3 text-xs text-burgundy-700">{error}</p> : null}
      {token ? (
        <form className="flex gap-2 border-t border-line p-3" onSubmit={async (e) => { e.preventDefault(); if (text.trim() && (await send({ action: "message", token, message: text.trim() }))) setText(""); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="h-10 flex-1 rounded-xl border border-line px-3 text-sm" />
          <button disabled={busy} className={buttonClass("primary", "sm")}>Send</button>
        </form>
      ) : (
        <form className="space-y-2 border-t border-line p-3" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await send({ action: "start", name: String(f.get("name")), phone: String(f.get("phone")), message: String(f.get("message")) });
        }}>
          <div className="grid grid-cols-2 gap-2">
            <input name="name" required placeholder="Your name" className="h-10 rounded-xl border border-line px-3 text-sm" />
            <input name="phone" required inputMode="tel" placeholder="Phone (WhatsApp)" className="h-10 rounded-xl border border-line px-3 text-sm" />
          </div>
          <textarea name="message" required rows={2} placeholder="Your question" className="w-full rounded-xl border border-line px-3 py-2 text-sm" />
          <button disabled={busy} className={buttonClass("primary", "sm", "w-full")}>{busy ? "Sending…" : "Start chat"}</button>
        </form>
      )}
    </div>
  );
}

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))]">
      {open ? (
        <div className="relative">
          <button onClick={() => setOpen(false)} className="absolute right-2 top-2 z-10 rounded-full p-1 text-ivory-50 hover:bg-white/10" aria-label="Close chat"><X className="size-5" /></button>
          <ChatPanel />
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="ml-auto flex items-center gap-2 rounded-full bg-sage-800 px-4 py-3 text-sm font-medium text-white shadow-lg"><MessageCircle className="size-5" aria-hidden /> Chat with us</button>
      )}
    </div>
  );
}
