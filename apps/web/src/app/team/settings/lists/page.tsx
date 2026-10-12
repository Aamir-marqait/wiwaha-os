import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { CATALOGUES } from "@/lib/catalogue";

export const metadata = { title: "Lists" };

/** Every reference list people maintain by hand, filtered to what this person may see. */
export default async function ListsPage() {
  const viewer = await requireStaff();
  const role = viewer.profile.role;
  const lists = Object.values(CATALOGUES).filter((c) => c.viewRoles.includes(role));
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Lists" subtitle="Vendors, stock, prices, spaces, rooms, dishes and plan templates. Add to them and edit them here; agents use them straight away." />
      <div className="grid gap-3 sm:grid-cols-2">
        {lists.map((c) => (
          <Link key={c.key} href={`/team/catalogue/${c.key}`}>
            <Card className="h-full p-4 transition-shadow hover:shadow-md">
              <p className="font-serif text-xl font-semibold">{c.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
              <p className="mt-2 text-xs text-sage-700">{c.editRoles.includes(role) ? "You can add and edit" : "View only"}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
