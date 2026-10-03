import { Card, buttonClass } from "@wiwaha/ui";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Wordmark } from "@/components/brand";
import { runRouting } from "@/lib/agents";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "How was your celebration?", robots: { index: false } };

/** The personalised review form emailed after each event (policy "reviews.after_event"). */
export default async function ReviewForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{20,64}$/.test(token)) notFound();
  const db = createAdminClient("public");
  const { data: r } = await db.from("reviews").select("id, submitted_at, wedding:weddings(title), contact:contacts(full_name)").eq("form_token", token).maybeSingle();
  if (!r) notFound();
  const w = (Array.isArray(r.wedding) ? r.wedding[0] : r.wedding) as { title: string } | null;
  const c = (Array.isArray(r.contact) ? r.contact[0] : r.contact) as { full_name: string } | null;

  async function submit(form: FormData) {
    "use server";
    const n = (k: string) => { const v = Number(form.get(k)); return Number.isFinite(v) ? v : null; };
    const score = n("score");
    if (!score || score < 1 || score > 5) return;
    const admin = createAdminClient("system");
    const { data } = await admin.from("reviews").update({
      score, nps: n("nps"), testimonial: String(form.get("testimonial") ?? "").slice(0, 3000) || null, publish_consent: form.get("consent") === "on",
      answers: { loved: String(form.get("loved") ?? ""), improve: String(form.get("improve") ?? "") }, submitted_at: new Date().toISOString(),
    }).eq("form_token", token).is("submitted_at", null).select("id, wedding_id").maybeSingle();
    if (data) {
      await admin.from("agent_tasks").insert({ kind: "review_submitted", wedding_id: data.wedding_id, payload: { review_id: data.id } });
      after(runRouting);
    }
    redirect(`/review/${token}`);
  }

  const first = c?.full_name.split(" ")[0];
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Wordmark subtitle="With love, from Wiwaha" />
      <Card className="mt-6 p-5">
        {r.submitted_at ? <p className="text-center font-serif text-2xl">Thank you{first ? `, ${first}` : ""}! 🙏</p> : (
          <form action={submit} className="space-y-4">
            <h1 className="font-serif text-2xl font-semibold">{first ? `${first}, how` : "How"} was {w?.title ?? "your celebration"}?</h1>
            <fieldset>
              <legend className="text-sm">Overall</legend>
              <div className="mt-2 flex justify-between gap-1">{[1, 2, 3, 4, 5].map((s) => <label key={s} className="flex flex-1 flex-col items-center rounded-xl border border-line py-2 text-lg has-[:checked]:bg-gold-100"><input type="radio" name="score" value={s} required className="sr-only" />{"★".repeat(s)}<span className="text-[10px] text-ink-soft">{s}</span></label>)}</div>
            </fieldset>
            <label className="block text-sm">How likely are you to recommend us (0–10)?<input type="number" name="nps" min={0} max={10} className="mt-1 block h-10 w-full rounded-xl border border-line px-3" /></label>
            <label className="block text-sm">What did you love?<textarea name="loved" rows={2} className="mt-1 block w-full rounded-xl border border-line px-3 py-2" /></label>
            <label className="block text-sm">What could we do better?<textarea name="improve" rows={2} className="mt-1 block w-full rounded-xl border border-line px-3 py-2" /></label>
            <label className="block text-sm">A few words we could share (optional)<textarea name="testimonial" rows={3} className="mt-1 block w-full rounded-xl border border-line px-3 py-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" /> You may share my words on Wiwaha&rsquo;s website and social pages</label>
            <button className={buttonClass("primary", "lg", "w-full")}>Send</button>
          </form>
        )}
      </Card>
    </main>
  );
}
