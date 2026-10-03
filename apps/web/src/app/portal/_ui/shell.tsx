import { daysBetween, formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { LANGS, type PortalDict } from "@/lib/i18n";
import { setLanguage } from "../actions";
import { PortalTabs } from "./tabs";

/** Portal header, tabs (scrollable at 375 px) and language switcher. */
export function PortalShell({ t, wedding, first, active, children }: { t: PortalDict; wedding: Record<string, unknown>; first: string; active: string; children: React.ReactNode }) {
  const days = daysBetween(todayIST(), wedding.event_start as string);
  const tabs = [
    { href: "/portal", key: "home", label: t.home }, { href: "/portal/brief", key: "brief", label: t.brief }, { href: "/portal/menus", key: "menus", label: t.menus },
    { href: "/portal/decor", key: "decor", label: t.decor }, { href: "/portal/quote", key: "quote", label: t.quote }, { href: "/portal/payments", key: "payments", label: t.payments },
    { href: "/portal/guests", key: "guests", label: t.guests }, { href: "/portal/family", key: "family", label: t.family }, { href: "/portal/chat", key: "chat", label: t.chat },
  ];
  return (
    <div className="min-h-dvh bg-ivory-100" lang={t.lang}>
      <header className="ornament bg-sage-800 px-4 pb-4 pt-6 text-ivory-50">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <Link href="/portal"><Wordmark subtitle={t.your_portal} light /></Link>
          <div className="flex items-center gap-2">
            <form action={setLanguage} className="flex">
              <select name="lang" defaultValue={t.lang} aria-label="Language" className="h-7 rounded-full bg-white/10 px-2 text-xs text-ivory-50 [&>option]:text-ink">
                {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="ml-1 rounded-full bg-white/10 px-2 text-xs">✓</button>
            </form>
            <form action="/auth/signout?to=portal" method="post"><button className="rounded-full bg-white/10 px-3 py-1 text-xs">{t.sign_out}</button></form>
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-sm text-sage-200">{t.namaste}, {first}</p>
          <h1 className="font-serif text-3xl font-semibold sm:text-5xl">{wedding.title as string}</h1>
          <p className="mt-1 text-sm text-sage-100">{formatDateIST(wedding.event_start as string, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {days > 0 ? `${days} ${t.days_to_go}` : days === 0 ? t.today : "With love, from Wiwaha"}</p>
        </div>
        <PortalTabs tabs={tabs} active={active} />
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}
