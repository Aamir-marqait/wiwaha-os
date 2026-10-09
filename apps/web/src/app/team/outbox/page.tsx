import { Card, EmptyState, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
import { manualSendLink } from "@/lib/send-links";
import { createClient } from "@/lib/supabase/server";
import { SendRow } from "./send-row";

export const metadata = { title: "To send" };

type Row = { id: string; channel: string; to_address: string | null; subject: string | null; body: string; created_at: string; lead_id: string | null; wedding_id: string | null; lead: { contact: { full_name: string } | null } | null; wedding: { title: string } | null };

/** Approved WhatsApp and email waiting to be sent by a person until the real providers are connected. */
export default async function OutboxPage() {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient();
  const { data } = await supabase.from("messages").select("id, channel, to_address, subject, body, created_at, lead_id, wedding_id, lead:leads(contact:contacts(full_name)), wedding:weddings(title)").eq("status", "approved").eq("direction", "outbound").in("channel", ["whatsapp", "email"]).order("created_at");
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageTitle title="To send" subtitle="Approved messages waiting for you. Tap the button, press send in WhatsApp or your mail app, then come back and confirm." />
      {rows.length === 0 ? <EmptyState title="Nothing to send">Messages appear here once they're approved. When WhatsApp and email are connected they go out by themselves.</EmptyState> : null}
      <div className="space-y-3">
        {rows.map((m) => {
          const who = m.lead?.contact?.full_name ?? m.wedding?.title ?? m.to_address ?? "Unknown";
          return (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{who} <span className="text-xs font-normal capitalize text-ink-soft">· {m.channel} · {m.to_address ?? "no address"}</span></p>
                  <p className="text-xs text-ink-soft">Approved {relativeFromNow(m.created_at)}{m.lead_id ? <> · <Link href={`/team/leads/${m.lead_id}`} className="underline">lead</Link></> : null}{m.wedding_id ? <> · <Link href={`/team/weddings/${m.wedding_id}`} className="underline">wedding</Link></> : null}</p>
                </div>
              </div>
              {m.subject ? <p className="mt-2 text-sm font-medium">{m.subject}</p> : null}
              <p className="mt-1 whitespace-pre-line rounded-xl bg-ivory-100 px-3 py-2 text-sm">{m.body}</p>
              <SendRow id={m.id} href={manualSendLink(m)} label={m.channel === "whatsapp" ? "Open WhatsApp" : "Open mail app"} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
