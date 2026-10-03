import type { Metadata } from "next";
import { ChatPanel } from "@/components/chat-widget";

export const metadata: Metadata = { title: "Chat with Wiwaha", robots: { index: false } };

/** Embeddable chat (iframe this on the Wiwaha website). */
export default function ChatPage() {
  return <ChatPanel embedded />;
}
