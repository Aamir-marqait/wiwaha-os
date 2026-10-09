/** One-tap links for sending by hand: WhatsApp's click-to-chat and the mail app. */
export function manualSendLink(m: { channel: string; to_address: string | null; subject: string | null; body: string }): string | null {
  if (!m.to_address) return null;
  if (m.channel === "whatsapp") return `https://wa.me/${m.to_address.replace(/\D/g, "")}?text=${encodeURIComponent(m.body)}`;
  if (m.channel === "email") return `mailto:${encodeURIComponent(m.to_address)}?subject=${encodeURIComponent(m.subject ?? "")}&body=${encodeURIComponent(m.body)}`;
  return null;
}
