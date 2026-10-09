import { normalisePhone } from "@wiwaha/db";
import { parseGuestCount, parseLooseDate } from "./inbound";
import type { InboundLead } from "./types";

/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF, and tab or semicolon separators (Meta exports use tabs). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES: Record<string, string[]> = {
  name: ["full name", "name", "first name", "lead name", "contact name", "customer name"],
  phone: ["phone number", "phone", "mobile", "mobile number", "contact number", "whatsapp number", "phone no"],
  email: ["email", "email address", "e mail"],
  city: ["city", "location", "town"],
  date: ["event date", "wedding date", "date wanted", "preferred date", "date", "when is your wedding"],
  guests: ["guests", "guest count", "number of guests", "no of guests", "approx guests", "how many guests"],
  message: ["message", "notes", "comments", "requirements", "tell us more", "additional information"],
  created: ["created time", "created", "submitted at", "timestamp", "date created"],
};

export interface CsvLeadResult { leads: InboundLead[]; errors: { line: number; reason: string }[]; headersMatched: string[] }

/**
 * Leads exported from Meta Lead Center, Google Ads lead forms or a spreadsheet.
 * Headers are matched loosely; anything unmatched is kept in the message.
 */
export function parseLeadCsv(text: string, source: InboundLead["source"]): CsvLeadResult {
  const rows = parseCsv(text);
  const errors: CsvLeadResult["errors"] = [];
  if (rows.length < 2) return { leads: [], errors: [{ line: 1, reason: "Add a header row and at least one lead" }], headersMatched: [] };
  const header = rows[0]!.map(norm);
  const col = (key: string) => header.findIndex((h) => ALIASES[key]!.includes(h));
  const idx: Record<string, number> = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)]));
  const used = new Set(Object.values(idx).filter((i) => i >= 0));
  const lastName = header.indexOf("last name");
  if ((idx.name ?? -1) < 0) errors.push({ line: 1, reason: "No name column (expected Full name or Name)" });
  if ((idx.phone ?? -1) < 0 && (idx.email ?? -1) < 0) errors.push({ line: 1, reason: "No phone or email column" });
  if (errors.length) return { leads: [], errors, headersMatched: [] };

  const leads: CsvLeadResult["leads"] = [];
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const get = (k: string) => (idx[k]! >= 0 ? r[idx[k]!] ?? "" : "");
    const name = [get("name"), lastName >= 0 && idx.name === header.indexOf("first name") ? r[lastName] ?? "" : ""].filter(Boolean).join(" ").trim();
    const phone = normalisePhone(get("phone"));
    const email = get("email").toLowerCase();
    if (!name) return void errors.push({ line, reason: "Missing name" });
    if (!phone && !/^\S+@\S+\.\S+$/.test(email)) return void errors.push({ line, reason: "No valid phone or email" });
    const extras = header.map((h, i) => (used.has(i) || i === lastName || !r[i] ? "" : `${h}: ${r[i]}`)).filter(Boolean);
    const message = [get("message"), ...extras].filter(Boolean).join(" · ").slice(0, 1800) || null;
    leads.push({
      source, externalId: `${phone ?? email}:${get("created") || line}`, fullName: name, phone, email: /^\S+@\S+\.\S+$/.test(email) ? email : null,
      city: get("city") || null, dateWanted: parseLooseDate(get("date")), guestCount: parseGuestCount(get("guests") ? `${get("guests")} guests` : ""),
      budgetText: null, message, sourceDetail: "CSV import", replyTo: null, raw: Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])),
    });
  });
  return { leads, errors, headersMatched: [...used].map((i) => header[i]!) };
}
