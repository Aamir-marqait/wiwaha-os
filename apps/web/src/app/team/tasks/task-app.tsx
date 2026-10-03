"use client";
import { Badge, buttonClass, Card, cn } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { enqueue, pending, remove, type QueuedCompletion } from "./offline-queue";

export interface TaskItem { id: string; title: string; description: string | null; dueAt: string | null; priority: string; status: string; proof: string; wedding: string | null; shared: boolean }

const CACHE_KEY = "wiwaha.tasks.v1";

async function submit(c: QueuedCompletion): Promise<void> {
  const supabase = createClient();
  let path: string | null = null;
  if (c.file) {
    const ext = (c.fileName?.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    path = `${c.taskId}/${Date.parse(c.completedAt)}.${ext}`;
    const up = await supabase.storage.from("task-proof").upload(path, c.file, { upsert: true, contentType: c.file.type || undefined });
    if (up.error) throw new Error(up.error.message);
  }
  const { error } = await supabase.rpc("complete_task", { p_task_id: c.taskId, p_proof_path: path, p_note: c.note || null, p_completed_at: c.completedAt });
  if (error) throw Object.assign(new Error(error.message), { permanent: /needs a|belongs to someone else|not found/i.test(error.message) });
}

export function TaskApp({ open, done, userId }: { open: TaskItem[]; done: TaskItem[]; userId: string }) {
  const [tasks, setTasks] = useState<TaskItem[]>(open);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Keep a copy for offline use; restore it if the server render came from the service-worker cache.
  useEffect(() => {
    try {
      if (open.length) localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, tasks: open, at: Date.now() }));
      else {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { userId: string; tasks: TaskItem[] } | null;
        if (cached?.userId === userId && !navigator.onLine) setTasks(cached.tasks);
      }
    } catch { /* storage unavailable: online-only */ }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [open, userId]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    let synced = 0;
    for (const c of await pending().catch(() => [] as QueuedCompletion[])) {
      try { await submit(c); await remove(c.taskId); synced++; }
      catch (e) { if ((e as { permanent?: boolean }).permanent) { await remove(c.taskId); setMsg(`Couldn't sync "${c.taskId.slice(0, 6)}": ${(e as Error).message}`); } }
    }
    const left = await pending().catch(() => [] as QueuedCompletion[]);
    setQueued(new Set(left.map((l) => l.taskId)));
    if (synced) setMsg(`${synced} offline completion${synced > 1 ? "s" : ""} synced.`);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void flush();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

  async function complete(t: TaskItem, file: File | null, note: string) {
    if ((t.proof === "photo" || t.proof === "file") && !file) { setMsg(`"${t.title}" needs a ${t.proof} as proof.`); return; }
    const c: QueuedCompletion = { taskId: t.id, note, completedAt: new Date().toISOString(), file, fileName: file?.name ?? null };
    try {
      if (!navigator.onLine) throw new Error("offline");
      await submit(c);
      setTasks((xs) => xs.filter((x) => x.id !== t.id));
      setMsg(`Done: ${t.title}`);
    } catch (e) {
      if ((e as { permanent?: boolean }).permanent) { setMsg((e as Error).message); return; }
      await enqueue(c);
      setQueued((q) => new Set(q).add(t.id));
      setMsg("Saved on this phone. It will sync when you're back online.");
    }
  }

  const overdue = tasks.filter((t) => t.dueAt && Date.parse(t.dueAt) < Date.now());
  return (
    <div className="space-y-4">
      {!online ? <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm text-gold-700">You&rsquo;re offline. Tick tasks as usual; they&rsquo;ll sync later.</p> : null}
      {msg ? <p role="status" className="rounded-xl bg-sage-100 px-3 py-2 text-sm text-sage-800">{msg}</p> : null}
      <p className="text-sm text-ink-soft">{tasks.length} open{overdue.length ? ` · ${overdue.length} overdue` : ""}{queued.size ? ` · ${queued.size} waiting to sync` : ""}</p>
      <ul className="space-y-3">
        {tasks.map((t) => <TaskCard key={t.id} t={t} queued={queued.has(t.id)} onDone={complete} />)}
      </ul>
      {tasks.length === 0 ? <Card className="p-5 text-center text-sm text-ink-soft">All clear. Thank you!</Card> : null}
      {done.length ? (
        <details className="rounded-2xl bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Done today ({done.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">{done.map((d) => <li key={d.id}>✓ {d.title}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function TaskCard({ t, queued, onDone }: { t: TaskItem; queued: boolean; onDone: (t: TaskItem, file: File | null, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const late = t.dueAt && Date.parse(t.dueAt) < Date.now();
  return (
    <li>
      <Card className={cn("p-4", queued && "opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{t.title}</p>
            <p className="text-xs text-ink-soft">{t.wedding ? `${t.wedding} · ` : ""}{t.dueAt ? formatDateTimeIST(t.dueAt) : "No due date"}{t.shared ? " · for your team" : ""}</p>
            {t.description ? <p className="mt-1 text-sm text-ink-soft">{t.description}</p> : null}
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {late ? <Badge tone="burgundy">Overdue</Badge> : t.priority === "urgent" || t.priority === "high" ? <Badge tone="gold">{t.priority}</Badge> : null}
            {t.proof === "photo" || t.proof === "file" ? <span className="text-[11px] text-ink-soft">{t.proof} proof</span> : null}
          </span>
        </div>
        {queued ? <p className="mt-2 text-xs text-gold-700">Completed offline · waiting to sync</p> : !open ? (
          <button onClick={() => setOpen(true)} className={cn(buttonClass("primary", "md"), "mt-3 w-full")}>Mark done</button>
        ) : (
          <div className="mt-3 space-y-2">
            {t.proof === "photo" || t.proof === "file" ? (
              <label className="block text-sm">{t.proof === "photo" ? "Photo" : "File"}
                <input type="file" accept={t.proof === "photo" ? "image/*" : undefined} capture={t.proof === "photo" ? "environment" : undefined} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
              </label>
            ) : null}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-10 w-full rounded-xl border border-line px-3 text-sm" />
            <div className="flex gap-2">
              <button disabled={busy} onClick={async () => { setBusy(true); await onDone(t, file, note); setBusy(false); }} className={cn(buttonClass("primary", "md"), "flex-1")}>{busy ? "Saving…" : "Done"}</button>
              <button onClick={() => setOpen(false)} className={buttonClass("ghost", "md")}>Cancel</button>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
