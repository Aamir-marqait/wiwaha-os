"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { noteMoodboardSlide, saveDecorBrief } from "../actions";

export interface Choice { key: string; label: string; hint?: string }
export interface PaletteChoice extends Choice { hex: string[] }
export interface AreaChoice { id: string; name: string; description: string | null; photo: string | null }
export interface FnChoice { id: string; name: string; type: string; dateLabel: string }
export interface QuestionnaireChoices {
  traditions: Choice[]; styles: Choice[]; palettes: PaletteChoice[]; flowers: Choice[]; elements: Choice[]; mandaps: Choice[];
  moods: Choice[]; seating: Choice[]; lighting: Choice[]; feels: Choice[];
}
interface FnAnswer { areas: string[]; mood?: string; seating?: string; lighting: string[]; must_haves?: string }
export interface Answers {
  traditions: string[]; tradition_note?: string; style?: string; palettes: string[]; avoid_colours?: string; flowers: string[]; elements: string[];
  feel?: string; mandap_style?: string; name_board_text?: string; functions: Record<string, FnAnswer>; inspiration?: string; avoid?: string; notes?: string;
}

const input = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";
const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${on ? "bg-sage-700 text-white ring-sage-700" : "bg-white text-ink ring-line hover:bg-ivory-100"}`;

function Chips({ list, value, onChange, multi = true, max }: { list: Choice[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean; max?: number }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((c) => {
        const on = value.includes(c.key);
        return (
          <button key={c.key} type="button" aria-pressed={on} title={c.hint} className={chip(on)} onClick={() => {
            if (!multi) onChange(on ? [] : [c.key]);
            else if (on) onChange(value.filter((k) => k !== c.key));
            else if (!max || value.length < max) onChange([...value, c.key]);
          }}>{c.label}</button>
        );
      })}
    </div>
  );
}

function Section({ n, title, help, children }: { n: number; title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1 rounded-2xl border border-line bg-white p-4 sm:p-5">
      <h3 className="font-serif text-xl font-semibold"><span className="mr-2 text-gold-600">{n}.</span>{title}</h3>
      {help ? <p className="text-sm text-ink-soft">{help}</p> : null}
      {children}
    </section>
  );
}

/** The décor questionnaire: traditions, colours, flowers, touches, and each function's spaces and mood. */
export function DecorQuestionnaire({ weddingId, initial, choices, areas, functions, editable, labels }: {
  weddingId: string; initial: Answers; choices: QuestionnaireChoices; areas: AreaChoice[]; functions: FnChoice[]; editable: boolean;
  labels: { save: string; saving: string; send: string; sending: string };
}) {
  const [a, setA] = useState<Answers>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((o) => ({ ...o, [k]: v }));
  const setFn = (id: string, patch: Partial<FnAnswer>) => setA((o) => ({ ...o, functions: { ...o.functions, [id]: { areas: [], lighting: [], ...o.functions[id], ...patch } } }));
  const save = (submit: boolean) => start(async () => {
    const r = await saveDecorBrief(weddingId, a as unknown as Record<string, unknown>, submit);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.ok ?? "" });
  });
  const hasWedding = functions.some((f) => f.type === "wedding");
  let n = 0;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(true); }}>
      <fieldset disabled={!editable || pending} className="space-y-4">
        <Section n={++n} title="Your traditions" help="So the décor feels like home to both families.">
          <Chips list={choices.traditions} value={a.traditions} onChange={(v) => set("traditions", v)} />
          <label className="mt-3 block text-sm">Anything specific? <input value={a.tradition_note ?? ""} onChange={(e) => set("tradition_note", e.target.value)} placeholder="e.g. Kashi yatra, banana leaves at the mantap, a Christian blessing after the muhurtham" className={input} /></label>
        </Section>
        <Section n={++n} title="The look">
          <Chips list={choices.styles} value={a.style ? [a.style] : []} multi={false} onChange={(v) => set("style", v[0])} />
          <p className="mt-3 text-sm">How full should it feel?</p>
          <Chips list={choices.feels} value={a.feel ? [a.feel] : []} multi={false} onChange={(v) => set("feel", v[0])} />
        </Section>
        <Section n={++n} title="Colours" help="Pick up to three colour stories.">
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {choices.palettes.map((p) => {
              const on = a.palettes.includes(p.key);
              return (
                <button key={p.key} type="button" aria-pressed={on} onClick={() => set("palettes", on ? a.palettes.filter((k) => k !== p.key) : a.palettes.length < 3 ? [...a.palettes, p.key] : a.palettes)} className={`overflow-hidden rounded-xl text-left ring-2 ${on ? "ring-sage-700" : "ring-transparent"} border border-line bg-white`}>
                  <span className="flex h-10">{p.hex.map((h) => <span key={h} className="flex-1" style={{ background: h }} />)}</span>
                  <span className="block px-2 py-1.5 text-sm">{p.label}</span>
                </button>
              );
            })}
          </div>
          <label className="mt-3 block text-sm">Colours to avoid <input value={a.avoid_colours ?? ""} onChange={(e) => set("avoid_colours", e.target.value)} placeholder="e.g. black, neon" className={input} /></label>
        </Section>
        <Section n={++n} title="Flowers and greens">
          <Chips list={choices.flowers} value={a.flowers} onChange={(v) => set("flowers", v)} />
        </Section>
        <Section n={++n} title="Traditional touches">
          <Chips list={choices.elements} value={a.elements} onChange={(v) => set("elements", v)} />
          {a.elements.includes("name_board") ? <label className="mt-3 block text-sm">What should the name board say? <input value={a.name_board_text ?? ""} onChange={(e) => set("name_board_text", e.target.value)} placeholder="e.g. Ananya weds Rohan" className={input} /></label> : null}
        </Section>
        {hasWedding ? (
          <Section n={++n} title="The mandap">
            <Chips list={choices.mandaps} value={a.mandap_style ? [a.mandap_style] : []} multi={false} onChange={(v) => set("mandap_style", v[0])} />
          </Section>
        ) : null}
        {functions.map((f) => {
          const fa = a.functions[f.id] ?? { areas: [], lighting: [] };
          return (
            <Section key={f.id} n={++n} title={`${f.name}`} help={`${f.dateLabel}. Which spaces will you use? Leave them unticked and we'll suggest the usual ones.`}>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {areas.map((ar) => {
                  const on = fa.areas.includes(ar.id);
                  return (
                    <button key={ar.id} type="button" aria-pressed={on} onClick={() => setFn(f.id, { areas: on ? fa.areas.filter((x) => x !== ar.id) : [...fa.areas, ar.id] })} className={`overflow-hidden rounded-xl border border-line bg-white text-left ring-2 ${on ? "ring-sage-700" : "ring-transparent"}`}>
                      {ar.photo ? <img src={ar.photo} alt="" loading="lazy" className="h-24 w-full object-cover" /> : <span className="block h-24 bg-ivory-100" />}
                      <span className="block px-2 py-1.5 text-sm font-medium">{ar.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-sm">Mood</p>
              <Chips list={choices.moods} value={fa.mood ? [fa.mood] : []} multi={false} onChange={(v) => setFn(f.id, { mood: v[0] })} />
              <p className="mt-3 text-sm">Guest seating</p>
              <Chips list={choices.seating} value={fa.seating ? [fa.seating] : []} multi={false} onChange={(v) => setFn(f.id, { seating: v[0] })} />
              <p className="mt-3 text-sm">Lighting</p>
              <Chips list={choices.lighting} value={fa.lighting} onChange={(v) => setFn(f.id, { lighting: v })} />
              <label className="mt-3 block text-sm">Must-haves for the {f.name.toLowerCase()} <input value={fa.must_haves ?? ""} onChange={(e) => setFn(f.id, { must_haves: e.target.value })} placeholder="e.g. a swing for the bride, a dhol entry" className={input} /></label>
            </Section>
          );
        })}
        <Section n={++n} title="Anything else">
          <label className="block text-sm">Inspiration (Pinterest or Instagram links, or describe it) <textarea rows={2} value={a.inspiration ?? ""} onChange={(e) => set("inspiration", e.target.value)} className={input} /></label>
          <label className="mt-3 block text-sm">Please avoid <input value={a.avoid ?? ""} onChange={(e) => set("avoid", e.target.value)} className={input} /></label>
          <label className="mt-3 block text-sm">Notes for our décor team <textarea rows={2} value={a.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className={input} /></label>
        </Section>
      </fieldset>
      {editable ? (
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-ivory-50/95 p-3 backdrop-blur sm:bottom-4">
          <button type="button" disabled={pending} onClick={() => save(false)} className={buttonClass("secondary", "md")}>{pending ? labels.saving : labels.save}</button>
          <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? labels.sending : labels.send}</button>
          {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-sage-700" : "text-sm text-burgundy-700"}>{msg.text}</p> : null}
        </div>
      ) : null}
    </form>
  );
}

/** "Ask for a change" on one picture. */
export function SlideNote({ slideId, current, remaining, labels }: { slideId: string; current: string | null; remaining: number; labels: { ask: string; send: string; sent: string } }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return (
    <div className="space-y-1">
      {current ? <p className="text-xs italic text-ink-soft">You asked: &ldquo;{current}&rdquo;</p> : null}
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm")}>{labels.ask}</button>
      {msg ? <p role="status" className="text-xs text-sage-700">{msg.text}</p> : null}
    </div>
  );
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await noteMoodboardSlide(slideId, note); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: labels.sent }); if (!r.error) { setOpen(false); setNote(""); } }); }}>
      <textarea rows={2} required minLength={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. More marigold and brass lamps; less white" className={input} />
      <p className="text-xs text-ink-soft">{remaining > 0 ? `We can redo this picture ${remaining} more time${remaining === 1 ? "" : "s"}; after that our décor team edits it by hand.` : "Our décor team will update this one by hand."}</p>
      <div className="flex gap-2"><button disabled={pending} className={buttonClass("primary", "sm")}>{labels.send}</button><button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button></div>
      {msg && !msg.ok ? <p role="alert" className="text-xs text-burgundy-700">{msg.text}</p> : null}
    </form>
  );
}
