import { cn } from "@wiwaha/ui";
import Link from "next/link";

const TABS = [
  { href: "/team/decor/areas", key: "areas", label: "Venue areas" },
  { href: "/team/decor", key: "stock", label: "Stock" },
  { href: "/team/decor/templates", key: "templates", label: "Templates by area" },
  { href: "/team/decor/assignments", key: "assignments", label: "Assigned to events" },
] as const;

export function DecorTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Décor" className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5">
        {TABS.map((t) => (
          <li key={t.key} className="shrink-0">
            <Link href={t.href} aria-current={t.key === active ? "page" : undefined} className={cn("block rounded-full px-3 py-1.5 text-sm", t.key === active ? "bg-sage-700 font-medium text-white" : "bg-ivory-200 text-ink hover:bg-ivory-100")}>{t.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
