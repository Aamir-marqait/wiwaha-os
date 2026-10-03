import { formatDateIST, formatDateTimeIST } from "@wiwaha/db";

export function DateText({ value, withTime = false }: { value: string | null | undefined; withTime?: boolean }) {
  if (!value) return <span className="text-ink-soft">—</span>;
  return <time dateTime={value}>{withTime ? formatDateTimeIST(value) : formatDateIST(value)}</time>;
}

export function relativeFromNow(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  const txt = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))} min` : h < 48 ? `${h} h` : `${d} days`;
  return diff >= 0 ? `in ${txt}` : `${txt} ago`;
}
