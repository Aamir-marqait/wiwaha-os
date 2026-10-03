/** Money is stored as integer paise; dates in UTC and shown in Asia/Kolkata. */
export const IST = "Asia/Kolkata";

export function rupees(paise: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (paise === null || paise === undefined) return "—";
  const r = paise / 100;
  if (opts.compact) {
    if (r >= 1_00_00_000) return `₹${trim(r / 1_00_00_000)} Cr`;
    if (r >= 1_00_000) return `₹${trim(r / 1_00_000)} L`;
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(r);
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatDateIST(iso: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "—";
  const d = typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00+05:30`) : new Date(iso);
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts }).format(d);
}

export function formatDateTimeIST(iso: string | Date | null | undefined): string {
  return formatDateIST(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Today's calendar date in India as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Normalises an Indian or international phone number to E.164.
 * Returns null when it can't be a valid number.
 */
export function normalisePhone(raw: string | null | undefined, defaultCountry = "91"): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  s = s.replace(/\D/g, "");
  if (s.startsWith("0")) s = s.replace(/^0+/, "");
  if (defaultCountry === "91") {
    if (s.length === 12 && s.startsWith("91") && /^[6-9]/.test(s.slice(2))) return `+${s}`;
    if (s.length === 10 && /^[6-9]/.test(s)) return `+91${s}`;
    return null;
  }
  return /^\d{6,14}$/.test(s) ? `+${defaultCountry}${s}` : null;
}
