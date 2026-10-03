import { Card, PageTitle } from "@wiwaha/ui";
import { Bot, BookOpen, Clock, History, Users } from "lucide-react";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireStaff();
  const owner = viewer.profile.role === "owner";
  const role = viewer.profile.role;
  const items = [
    { href: "/team/settings/policy", icon: BookOpen, title: "Policy book", body: owner ? "The rules every agent answers from. Edit a rule and the next agent answer reflects it." : "The rules every agent answers from." },
    { href: "/team/settings/agents", icon: Bot, title: "Agents", body: owner ? "Autonomy dial, kill switch and model for each of the 21 agents." : "See which agents are live and how much they may do alone." },
    ...(owner ? [{ href: "/team/settings/team", icon: Users, title: "Team & invites", body: "Invite staff by email and set their role." }] : []),
    ...(owner || role === "sales" ? [{ href: "/team/settings/availability", icon: Clock, title: "Site-visit hours", body: "When each sales executive can host a visit (the sales calendar)." }] : []),
    { href: "/team/settings/activity", icon: History, title: "Activity log", body: owner ? "Every agent action, and every edit with user, time and IP." : "Every agent action." },
  ];
  return (
    <>
      <PageTitle title="Settings" />
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="flex h-full gap-4 p-5 transition-shadow hover:shadow-lg">
              <i.icon className="mt-1 size-6 shrink-0 text-gold-500" aria-hidden />
              <div><p className="font-serif text-xl font-semibold">{i.title}</p><p className="mt-1 text-sm text-ink-soft">{i.body}</p></div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
