import { Card, cn } from "@wiwaha/ui";
import { formatDateTimeIST } from "@wiwaha/db";
import { ChatBox } from "../_ui/forms";
import { loadPortal } from "../_ui/load";
import { PortalShell } from "../_ui/shell";

export const metadata = { title: "Chat" };

export default async function ChatPage() {
  const { viewer, supabase, t, wedding } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  // RLS shows only messages that were actually sent (never drafts awaiting approval).
  const { data: msgs } = await supabase.from("messages").select("id, body, direction, author_kind, author_user_id, created_at, metadata, channel").eq("wedding_id", w.id).eq("client_visible", true).order("created_at", { ascending: false }).limit(60);
  const list = [...(msgs ?? [])].reverse();
  return (
    <PortalShell t={t} wedding={w} first={first} active="chat">
      <p className="text-sm text-ink-soft">{t.chat_help}</p>
      <Card className="p-3 sm:p-4">
        <ol className="space-y-2">
          {list.length === 0 ? <li className="py-6 text-center text-sm text-ink-soft">{t.nothing_yet}</li> : null}
          {list.map((m) => {
            const mine = m.author_user_id === viewer.userId;
            const name = ((m.metadata ?? {}) as { name?: string }).name ?? (m.direction === "outbound" ? "Team Wiwaha" : "Family");
            return (
              <li key={m.id as string} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3 py-2", mine ? "bg-sage-700 text-white" : m.direction === "outbound" ? "bg-ivory-100" : "bg-gold-100")}>
                  {!mine ? <p className="text-[11px] font-medium opacity-70">{name}{m.channel === "whatsapp" ? " · WhatsApp" : ""}</p> : null}
                  <p className="whitespace-pre-line text-[15px]">{m.body as string}</p>
                  <p className="mt-0.5 text-right text-[10px] opacity-60">{formatDateTimeIST(m.created_at as string)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
      <ChatBox weddingId={w.id as string} label={t.send} />
    </PortalShell>
  );
}
