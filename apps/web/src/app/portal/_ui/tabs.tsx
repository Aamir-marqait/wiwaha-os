import Link from "next/link";
import { cn } from "@wiwaha/ui";

export function PortalTabs({ tabs, active }: { tabs: { href: string; key: string; label: string }[]; active: string }) {
  return (
    <nav aria-label="Portal" className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="mx-auto flex max-w-3xl gap-1.5">
        {tabs.map((tab) => (
          <li key={tab.key} className="shrink-0">
            <Link href={tab.href} aria-current={tab.key === active ? "page" : undefined}
              className={cn("block rounded-full px-3 py-1.5 text-sm", tab.key === active ? "bg-ivory-50 font-medium text-sage-800" : "bg-white/10 text-ivory-50 hover:bg-white/20")}>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
