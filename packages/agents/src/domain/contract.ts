import { formatDateIST, rupees } from "@wiwaha/db";
import type { PolicyBook } from "@wiwaha/policy";

/**
 * The plain black-and-white contract (policy "contract.template"). Every
 * term is quoted from the policy book, so the contract can never promise
 * something the policy book doesn't say.
 */
export interface ContractData {
  weddingCode: string;
  couple: string;
  primaryContact: { name: string; phone: string | null; email: string | null };
  eventStart: string;
  eventEnd: string;
  guestCount: number | null;
  spaces: string[];
  complimentaryRooms: number;
  totalPaise: number;
  payments: { label: string; amountPaise: number; dueOn: string }[];
  version: number;
  preparedOn: string;
}

export function renderContract(book: PolicyBook, d: ContractData): string {
  const venue = book.get("venue.facts");
  const rule = (k: Parameters<PolicyBook["ruleText"]>[0]) => book.ruleText(k);
  const lines = [
    `# Venue Agreement — ${d.weddingCode}`,
    "",
    `Version ${d.version} · prepared on ${formatDateIST(d.preparedOn, { day: "numeric", month: "long", year: "numeric" })}`,
    "",
    "## Parties",
    `This agreement is between **Wiwaha by Praman** ("the Venue"), a private ${venue.estate_acres}-acre estate ${venue.airport_distance_km} km from Bengaluru airport, and **${d.primaryContact.name}** on behalf of **${d.couple}** ("the Client").`,
    `Client contact: ${[d.primaryContact.phone, d.primaryContact.email].filter(Boolean).join(" · ") || "—"}`,
    "",
    "## The event",
    `- Dates: ${formatDateIST(d.eventStart, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${d.eventEnd !== d.eventStart ? ` to ${formatDateIST(d.eventEnd, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : ""}`,
    `- Spaces reserved: ${d.spaces.length ? d.spaces.join(", ") : "as listed in the confirmed booking"}`,
    d.guestCount ? `- Expected guests: ${d.guestCount}` : null,
    `- Guest rooms: ${d.complimentaryRooms} complimentary room${d.complimentaryRooms === 1 ? "" : "s"} with this booking`,
    "",
    "## Fees and payment schedule",
    `Total contract value: **${rupees(d.totalPaise)}** (inclusive of the items in the approved quote; final invoice per the approved quote and applicable GST).`,
    "",
    "| Milestone | Amount | Due |",
    "| --- | --- | --- |",
    ...d.payments.map((p) => `| ${p.label} | ${rupees(p.amountPaise)} | ${formatDateIST(p.dueOn)} |`),
    "",
    `Terms: ${rule("payments.schedule")}`,
    "",
    "## Décor and infrastructure",
    rule("decor.providers"),
    "",
    "## Planning",
    rule("planning.start"),
    "",
    "## Records",
    rule("audit.portal_edits"),
    "",
    "## General",
    "- Only commitments written in this agreement or in the approved quote are binding on the Venue.",
    "- Cancellation and refund terms: **[to be confirmed by Prashanth before this agreement is sent — open question in the policy book]**",
    `- This agreement is signed electronically by both parties. ${rule("contract.template")}`,
    "",
    "Signed for Wiwaha by Praman: ______________________",
    "",
    `Signed by the Client (${d.primaryContact.name}): ______________________`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}
