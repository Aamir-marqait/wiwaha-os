import { daysBetween, formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { LANGS, type PortalDict } from "@/lib/i18n";
import { cookies } from "next/headers";
import { PREVIEW_COOKIE } from "@/lib/portal-preview";
import { endPortalPreview } from "@/app/team/clients/preview-actions";
import { setLanguage } from "../actions";
import { PortalTabs } from "./tabs";
import { planningState } from "./planning";

/** Portal header, tabs (scrollable at 375 px) and language switcher. */
export async function PortalShell({ t, wedding, first, active, children }: { t: PortalDict; wedding: Record<string, unknown>; first: string; active: string; children: React.ReactNode }) {
  const preview = (await cookies()).get(PREVIEW_COOKIE)?.value === wedding.id;
  const days = daysBetween(todayIST(), wedding.event_start as string);
  const tabs = [
    { href: "/portal", key: "home", label: t.home }, { href: "/portal/brief", key: "brief", label: t.brief }, { href: "/portal/menus", key: "menus", label: t.menus },
    { href: "/portal/decor", key: "decor", label: t.decor }, { href: "/portal/options/entertainment", key: "entertainment", label: t.entertainment }, { href: "/portal/options/extras", key: "extras", label: t.extras },
    { href: "/portal/ideas", key: "ideas", label: t.ideas }, { href: "/portal/quote", key: "quote", label: t.quote }, { href: "/portal/payments", key: "payments", label: t.payments },
    { href: "/portal/guests", key: "guests", label: t.guests }, { href: "/portal/family", key: "family", label: t.family }, { href: "/portal/chat", key: "chat", label: t.chat },
  ];
  // Until planning opens, only Home and Ideas.
  const shown = planningState(wedding.event_start as string).open ? tabs : tabs.filter((x) => x.key === "home" || x.key === "ideas");
  return (
    <div className="min-h-dvh bg-ivory-100" lang={t.lang}>
      {preview ? (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gold-500 px-4 py-2 text-center text-sm text-ink">
          <span><strong>Preview:</strong> exactly what {first || "the couple"} sees. Read-only.</span>
          <form action={endPortalPreview}><button className="rounded-full bg-ink px-3 py-1 text-xs text-white">Back to the Wedding Room</button></form>
        </div>
      ) : null}
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
            {preview ? null : <form action="/auth/signout?to=portal" method="post"><button className="rounded-full bg-white/10 px-3 py-1 text-xs">{t.sign_out}</button></form>}
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-sm text-sage-200">{t.namaste}, {first}</p>
          <h1 className="font-serif text-3xl font-semibold sm:text-5xl">{wedding.title as string}</h1>
          <p className="mt-1 text-sm text-sage-100">{formatDateIST(wedding.event_start as string, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {days > 0 ? `${days} ${t.days_to_go}` : days === 0 ? t.today : "With love, from Wiwaha"}</p>
        </div>
        <PortalTabs tabs={shown} active={active} />
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}
