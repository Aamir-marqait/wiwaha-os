import { Card, buttonClass } from "@wiwaha/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { getViewer, isStaff, ROLE_LABELS } from "@/lib/auth";
import { allowedRoles, getClient } from "@/lib/mcp/oauth";
import { decideConnection } from "./actions";

export const metadata: Metadata = { title: "Connect Claude", robots: { index: false } };
export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="ornament flex min-h-dvh items-center justify-center bg-ivory-100 px-4 py-12">
      <Card className="w-full max-w-md space-y-5 p-6 sm:p-8">
        <Wordmark subtitle="Wiwaha OS" />
        {children}
      </Card>
    </main>
  );
}

/** Claude asks to act as you: sign in, then allow or refuse. */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const client = p.client_id ? await getClient(p.client_id) : null;
  const valid = !!client && p.response_type === "code" && !!p.redirect_uri && client.redirect_uris.includes(p.redirect_uri)
    && !!p.code_challenge && (p.code_challenge_method ?? "S256") === "S256";
  if (!valid) {
    return <Shell><h1 className="font-serif text-2xl font-semibold">This connection link isn&rsquo;t valid</h1><p className="text-sm text-ink-soft">Start again from Claude: Settings → Connectors → Wiwaha OS → Connect.</p></Shell>;
  }
  const viewer = await getViewer();
  if (!viewer) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string")).toString()}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }
  const allowed = isStaff(viewer.profile.role) && viewer.profile.active && allowedRoles().includes(viewer.profile.role);
  return (
    <Shell>
      <div>
        <h1 className="font-serif text-2xl font-semibold">Connect Claude to Wiwaha OS?</h1>
        <p className="mt-1 text-sm text-ink-soft">Signed in as <strong>{viewer.profile.full_name}</strong> ({ROLE_LABELS[viewer.profile.role]}, {viewer.email}).</p>
      </div>
      {allowed ? (
        <>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Claude ({client!.client_name ?? "Claude"}) will act as you: it can read and change everything you can in Wiwaha OS.</li>
            <li>Every change is logged with your name, the time and that it came from Claude.</li>
            <li>You can disconnect at any time in Settings → Claude connector.</li>
          </ul>
          <form action={decideConnection} className="flex flex-wrap gap-2">
            {(["client_id", "redirect_uri", "state", "code_challenge", "scope", "resource"] as const).map((k) => <input key={k} type="hidden" name={k} value={p[k] ?? ""} />)}
            <button name="decision" value="allow" className={buttonClass("primary", "lg")}>Allow</button>
            <button name="decision" value="deny" className={buttonClass("ghost", "lg")}>Cancel</button>
          </form>
        </>
      ) : (
        <>
          <p className="rounded-xl bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">The Claude connector is switched on only for {allowedRoles().map((r) => ROLE_LABELS[r]).join(", ")} accounts for now.</p>
          <form action={decideConnection}>
            {(["client_id", "redirect_uri", "state"] as const).map((k) => <input key={k} type="hidden" name={k} value={p[k] ?? ""} />)}
            <button name="decision" value="deny" className={buttonClass("secondary", "md")}>Back to Claude</button>
          </form>
        </>
      )}
    </Shell>
  );
}
