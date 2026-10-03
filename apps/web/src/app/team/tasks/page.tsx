import { PageTitle } from "@wiwaha/ui";
import { addDays, todayIST } from "@wiwaha/db";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TaskApp, type TaskItem } from "./task-app";

export const metadata: Metadata = { title: "My tasks", manifest: "/manifest.webmanifest" };

/** Each person's tasks on their phone: tick with photo or file proof, offline on event days. */
export default async function TasksPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const today = todayIST();
  const role = viewer.profile.role;
  const [mine, roleWide, doneToday] = await Promise.all([
    supabase.from("tasks").select("id, title, description, due_at, priority, status, proof_kind, wedding:weddings(title)").eq("owner_id", viewer.userId).in("status", ["todo", "in_progress", "blocked"]).lt("due_at", `${addDays(today, 15)}T00:00:00+05:30`).order("due_at"),
    supabase.from("tasks").select("id, title, description, due_at, priority, status, proof_kind, wedding:weddings(title)").is("owner_id", null).eq("owner_role", role).in("status", ["todo", "in_progress", "blocked"]).lt("due_at", `${addDays(today, 15)}T00:00:00+05:30`).order("due_at"),
    supabase.from("tasks").select("id, title, description, due_at, priority, status, proof_kind, wedding:weddings(title)").eq("completed_by", viewer.userId).gte("completed_at", `${today}T00:00:00+05:30`).order("completed_at", { ascending: false }),
  ]);
  const shape = (rows: typeof mine.data, shared: boolean): TaskItem[] => (rows ?? []).map((t) => {
    const w = (Array.isArray(t.wedding) ? t.wedding[0] : t.wedding) as { title: string } | null;
    return { id: t.id as string, title: t.title as string, description: (t.description as string | null) ?? null, dueAt: (t.due_at as string | null) ?? null, priority: t.priority as string, status: t.status as string, proof: t.proof_kind as string, wedding: w?.title ?? null, shared };
  });
  return (
    <>
      <PageTitle title="My tasks" subtitle="Tick each one when it's done. Works offline: completions sync when you're back on the network." />
      <TaskApp userId={viewer.userId} open={[...shape(mine.data, false), ...shape(roleWide.data, true)].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))} done={shape(doneToday.data, false)} />
    </>
  );
}
