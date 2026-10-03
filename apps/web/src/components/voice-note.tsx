"use client";
import { useEffect, useRef, useState } from "react";

type Rec = { start(): void; stop(): void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type RecCtor = new () => Rec;

/**
 * Dictation on the phone (the browser's own speech recognition, so nothing
 * leaves the device until the note is saved). Falls back to typing.
 */
export function VoiceNote({ value, onChange, lang = "en-IN" }: { value: string; onChange: (v: string) => void; lang?: string }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Rec | null>(null);
  const base = useRef("");
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);
  function toggle() {
    if (listening) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang; r.continuous = true; r.interimResults = true;
    base.current = value ? `${value.trim()} ` : "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]![0]!.transcript;
      onChange(base.current + text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }
  return (
    <div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder="What did they love? Any worries? Next step?" className="block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
      {supported ? (
        <button type="button" onClick={toggle} className={`mt-2 rounded-full px-3 py-1.5 text-xs font-medium ${listening ? "bg-burgundy-600 text-white" : "bg-sage-100 text-sage-800"}`}>
          {listening ? "● Listening… tap to stop" : "🎙 Dictate voice note"}
        </button>
      ) : null}
    </div>
  );
}
