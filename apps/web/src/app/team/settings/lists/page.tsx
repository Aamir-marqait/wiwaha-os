import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { CATALOGUES } from "@/lib/catalogue";

export const metadata = { title: "Lists" };

/** Lists under the same headings as the business. */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Venue", keys: ["spaces", "rooms", "inventory", "maintenance"] },
  { title: "Décor", keys: ["decor_templates"] },
  { title: "Entertainment", keys: ["entertainment"] },
  { title: "Food & beverage", keys: ["dishes"] },
  { title: "Extras", keys: ["extras"] },
  { title: "Vendors", keys: ["vendors"] },
  { title: "Prices", keys: ["price_book"] },
  { title: "Planning templates", keys: ["plan", "run_of_show"] },
];

/** Every reference list people maintain by hand, filtered to what this person may see. */
export default async function ListsPage() {
  const viewer = await requireStaff();
  const role = viewer.profile.role;
  const lists = Object.values(CATALOGUES).filter((c) => c.viewRoles.includes(role));
  const groups = GROUPS.map((g) => ({ ...g, lists: lists.filter((c) => g.keys.includes(c.key)) })).filter((g) => g.lists.length);
  const rest = lists.filter((c) => !GROUPS.some((g) => g.keys.includes(c.key)));
  if (rest.length) groups.push({ title: "Other", keys: [], lists: rest });
  return (
    <>
      <Link href="/team/settings" className="text-sm text-sage-700 hover:underline">← Settings</Link>
      <PageTitle title="Lists" subtitle="Everything the team maintains by hand, by heading. Add to them and edit them here; agents use them straight away." />
      <div className="space-y-6">
      {groups.map((g) => (
      <section key={g.title}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">{g.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {g.lists.map((c) => (
          <Link key={c.key} href={`/team/catalogue/${c.key}`}>
            <Card className="h-full p-4 transition-shadow hover:shadow-md">
              <p className="font-serif text-xl font-semibold">{c.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
              <p className="mt-2 text-xs text-sage-700">{c.editRoles.includes(role) ? "You can add and edit" : "View only"}</p>
            </Card>
          </Link>
        ))}
      </div>
      </section>
      ))}
      </div>
    </>
  );
}
