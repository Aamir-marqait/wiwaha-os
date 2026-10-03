import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-sage-700 text-white hover:bg-sage-800 focus-visible:outline-sage-700",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-ivory-100 focus-visible:outline-sage-600",
  ghost: "text-sage-800 hover:bg-sage-50 focus-visible:outline-sage-600",
  danger: "bg-burgundy-600 text-white hover:bg-burgundy-700 focus-visible:outline-burgundy-600",
  gold: "bg-gold-400 text-ink hover:bg-gold-300 focus-visible:outline-gold-500",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-line/70", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-serif text-xl font-semibold leading-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "sage" | "gold" | "burgundy" | "neutral" | "solid";
const tones: Record<Tone, string> = {
  sage: "bg-sage-100 text-sage-800",
  gold: "bg-gold-100 text-gold-700",
  burgundy: "bg-burgundy-100 text-burgundy-700",
  neutral: "bg-ivory-200 text-ink-soft",
  solid: "bg-sage-700 text-white",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-ivory-50 px-6 py-10 text-center">
      <p className="font-serif text-xl text-ink">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "sage" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "sage" | "gold" | "burgundy" }) {
  const ring = { sage: "text-sage-700", gold: "text-gold-600", burgundy: "text-burgundy-600" }[tone];
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={cn("mt-1 font-serif text-3xl font-semibold", ring)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
    </Card>
  );
}
