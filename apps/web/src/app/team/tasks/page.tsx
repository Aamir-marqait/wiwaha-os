import { Badge, Card, PageTitle, cn } from "@wiwaha/ui";
import { addDays, formatDateTimeIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { AddTask } from "./add-task";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TaskApp, type TaskItem } from "./task-app";

export const metadata: Metadata = { title: "My tasks", manifest: "/manifest.webmanifest" };

/** Each person's tasks on their phone: tick with photo or file proof, offline on event days. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const today = todayIST();
  const role = viewer.profile.role;
  const manager = ["owner", "event_manager", "sales"].includes(role);
  const team = manager && (await searchParams).view === "team";
  const [mine, roleWide, doneToday] = await Promise.all([
    supabase.from("tasks").select("id, title, description, due_at, priority, status, proof_kind, wedding:weddings(title)").eq("owner_id", viewer.userId).in("status", ["todo", "in_progress", "blocked"]).lt("due_at", `${addDays(today, 15)}T00:00:00+05:30`).order("due_at"),
    supabase.from("tasks").select("id, title, description, due_at, priority, status, proof_kind, wedding:weddings(title)").is("owner_id", null).eq("owner_role", role).in("status", ["todo", "in_progress", "blocked"]).lt("due_at", `${addDays(today, 15)}T00:00:00+05:30`).order("due_at"),
    supabase.from("tasks").select("id, title, description, due_at, priority, status, proof_kind, wedding:weddings(title)").eq("completed_by", viewer.userId).gte("completed_at", `${today}T00:00:00+05:30`).order("completed_at", { ascending: false }),
  ]);
  const shape = (rows: typeof mine.data, shared: boolean): TaskItem[] => (rows ?? []).map((t) => {
    const w = (Array.isArray(t.wedding) ? t.wedding[0] : t.wedding) as { title: string } | null;
    return { id: t.id as string, title: t.title as string, description: (t.description as string | null) ?? null, dueAt: (t.due_at as string | null) ?? null, priority: t.priority as string, status: t.status as string, proof: t.proof_kind as string, wedding: w?.title ?? null, shared };
  });
  const [people, weddings, everyone] = manager ? await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("active", true).in("role", ["owner", "sales", "event_manager", "staff", "accounts"]).order("full_name"),
    supabase.from("weddings").select("id, title").eq("status", "active").order("event_start"),
    team ? supabase.from("tasks").select("id, title, due_at, priority, status, owner_role, owner:profiles!tasks_owner_id_fkey(full_name), wedding:weddings(title)").in("status", ["todo", "in_progress", "blocked"]).order("due_at").limit(300) : Promise.resolve({ data: [] as never[] }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const tabs = manager ? (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1">
        <Link href="/team/tasks" className={cn("rounded-full px-3 py-1.5 text-sm", !team ? "bg-sage-700 text-white" : "bg-white text-ink-soft ring-1 ring-line")}>Mine</Link>
        <Link href="/team/tasks?view=team" className={cn("rounded-full px-3 py-1.5 text-sm", team ? "bg-sage-700 text-white" : "bg-white text-ink-soft ring-1 ring-line")}>Everyone</Link>
      </div>
      <AddTask today={today} people={(people.data ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string, role: p.role as string }))} weddings={(weddings.data ?? []).map((w) => ({ id: w.id as string, title: w.title as string }))} />
    </div>
  ) : null;
  if (team) {
    const rows = (everyone.data ?? []) as unknown as { id: string; title: string; due_at: string | null; priority: string; owner_role: string | null; owner: { full_name: string } | null; wedding: { title: string } | null }[];
    return (
      <>
        <PageTitle title="Everyone's tasks" subtitle="Open tasks across the team, soonest first" />
        {tabs}
        <Card>
          <ul className="divide-y divide-line/70">
            {rows.length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing open.</li> : null}
            {rows.map((t) => {
              const late = t.due_at && Date.parse(t.due_at) < Date.now();
              return (
                <li key={t.id} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0"><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-ink-soft">{t.owner?.full_name ?? `Anyone: ${String(t.owner_role ?? "").replace("_", " ")}`}{t.wedding ? ` · ${t.wedding.title}` : ""}{t.due_at ? ` · ${formatDateTimeIST(t.due_at)}` : ""}</p></div>
                  {late ? <Badge tone="burgundy">Overdue</Badge> : t.priority === "urgent" || t.priority === "high" ? <Badge tone="gold">{t.priority}</Badge> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageTitle title="My tasks" subtitle="Tick each one when it's done. Works offline: completions sync when you're back on the network." />
      {tabs}
      <TaskApp userId={viewer.userId} open={[...shape(mine.data, false), ...shape(roleWide.data, true)].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))} done={shape(doneToday.data, false)} />
    </>
  );
}
