import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { removeWindow } from "./actions";
import { WindowForm } from "./window-form";

export const metadata = { title: "Visit hours" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AvailabilityPage() {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient();
  const [{ data: people }, { data: windows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "sales").eq("active", true).order("full_name"),
    supabase.from("exec_availability").select("*").order("weekday").order("start_time"),
  ]);
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Site-visit hours" subtitle="When each sales executive can host a visit. Visits are only offered inside these hours and the estate's visiting hours (policy book). Executives with no hours set are treated as available all visiting hours." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {(people ?? []).map((p) => {
            const mine = (windows ?? []).filter((w) => w.profile_id === p.id);
            return (
              <Card key={p.id as string} className="p-4 sm:p-5">
                <h2 className="font-serif text-xl font-semibold">{p.full_name as string}</h2>
                {mine.length === 0 ? <p className="mt-1 text-sm text-ink-soft">No hours set: available during all visiting hours.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {mine.map((w) => <li key={w.id as string} className="flex items-center justify-between rounded-lg bg-ivory-100 px-3 py-1.5"><span>{DAYS[w.weekday as number]} · {String(w.start_time).slice(0, 5)}–{String(w.end_time).slice(0, 5)}</span><ActionButton action={removeWindow.bind(null, w.id as string)} variant="ghost">Remove</ActionButton></li>)}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
        <Card className="p-4 sm:p-5"><h2 className="mb-3 font-serif text-xl font-semibold">Add hours</h2><WindowForm people={(people ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string }))} /></Card>
      </div>
    </>
  );
}
