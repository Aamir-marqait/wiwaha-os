export function Wordmark({ subtitle, light = false }: { subtitle?: string; light?: boolean }) {
  return (
    <div className="leading-none">
      <p className={`font-serif text-2xl font-semibold tracking-wide ${light ? "text-ivory-50" : "text-sage-800"}`}>
        Wiwaha <span className={light ? "text-gold-200" : "text-gold-500"}>by Praman</span>
      </p>
      {subtitle ? <p className={`mt-1 text-[11px] font-medium uppercase tracking-[0.2em] ${light ? "text-sage-200" : "text-ink-soft"}`}>{subtitle}</p> : null}
    </div>
  );
}
